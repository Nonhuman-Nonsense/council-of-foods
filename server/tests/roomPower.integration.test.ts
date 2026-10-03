import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "http";
import { INSTALLATION_KEY_HEADER } from "@api/installationKey.js";
import { registerRoomPowerRoutes } from "@api/roomPowerRoutes.js";
import { getMeterSnapshot } from "@api/meterRoutes.js";
import type { Venue } from "@models/Venues.js";
import { roomPowerCollection, roomPowerHoursCollection } from "@services/DbService.js";
import { meterEvents } from "@services/meterEvents.js";
import { recordRoomPower, type PlacedRoomPowerReport } from "@services/RoomPowerService.js";
import type { RoomPowerReading, RoomPowerReport } from "@shared/MeterTypes.js";

const KEY = "installation-key-for-tests-0123";

function venue(id: string, plugs: Venue["plugs"]): Venue {
    return {
        id,
        name: id,
        alertEmails: ["staff@example.org"],
        timezone: "Europe/Stockholm",
        openingHours: { days: ["wed"], from: "12:00", to: "16:00" },
        plugs,
    };
}

const OSLO_PLUGS = [{ plug: 1, label: "Projector" }, { plug: 2, label: "Sound" }];
const VENUES = [venue("museum-oslo", OSLO_PLUGS), venue("elsewhere", [{ plug: 3, label: "Projector" }])];

const mockConfig = vi.hoisted(() => ({ key: undefined as string | undefined, venues: undefined as unknown }));

vi.mock("@root/src/config.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@root/src/config.js")>();
    return {
        config: new Proxy(actual.config, {
            get: (target, prop) => {
                if (prop === "COUNCIL_INSTALLATION_KEY") return mockConfig.key;
                if (prop === "COUNCIL_VENUES") return mockConfig.venues;
                return Reflect.get(target, prop);
            },
        }),
    };
});

function plugOne(overrides: Partial<RoomPowerReport> = {}): RoomPowerReport {
    return {
        plug: 1,
        deviceId: "shellyplugsg3-aabbcc",
        watts: 244,
        energyCounterWh: 1000,
        ...overrides,
    };
}

function placed(overrides: Partial<PlacedRoomPowerReport> = {}): PlacedRoomPowerReport {
    return { ...plugOne(), venueId: "museum-oslo", label: "Projector", ...overrides };
}

describe("POST /api/installation/room-power (integration)", () => {
    let httpServer: http.Server;
    let base: string;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        registerRoomPowerRoutes(app);
        httpServer = http.createServer(app);
        await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
        base = `http://127.0.0.1:${(httpServer.address() as { port: number }).port}`;
    });

    afterAll(() => new Promise<void>((resolve) => httpServer.close(() => resolve())));

    beforeEach(async () => {
        mockConfig.key = KEY;
        mockConfig.venues = VENUES;
        await roomPowerCollection?.deleteMany({});
        await roomPowerHoursCollection?.deleteMany({});
    });

    function report(body: unknown, key: string | null = KEY) {
        return fetch(`${base}/api/installation/room-power`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(key !== null ? { [INSTALLATION_KEY_HEADER]: key } : {}) },
            body: JSON.stringify(body),
        });
    }

    it.each([
        { name: "no key is configured", configured: undefined, key: KEY, body: plugOne(), status: 503 },
        { name: "the key is missing", configured: KEY, key: null, body: plugOne(), status: 401 },
        { name: "the key is wrong", configured: KEY, key: "not-the-key-at-all-000000", body: plugOne(), status: 401 },
        { name: "the reading is implausible", configured: KEY, key: KEY, body: plugOne({ watts: 50_000 }), status: 400 },
        { name: "the plug is at no venue", configured: KEY, key: KEY, body: plugOne({ plug: 9 }), status: 404 },
    ])("refuses a report when $name", async ({ configured, key, body, status }) => {
        mockConfig.key = configured;

        expect((await report(body, key)).status).toBe(status);
        expect(await roomPowerCollection!.countDocuments()).toBe(0);
    });

    it("accumulates energy from the plug's counter, across a counter reset", async () => {
        for (const energyCounterWh of [1000, 1010, 1025, 3, 8]) {
            expect((await report(plugOne({ energyCounterWh }))).status).toBe(204);
        }

        const [reading] = (await getMeterSnapshot("museum-oslo")).room;
        // 0 at first sight, +10, +15, reset (+3), +5
        expect(reading).toMatchObject({ plug: 1, label: "Projector", watts: 244, energyWh: 33 });
    });

    it("keeps each plug's energy per hour, from the same counter deltas", async () => {
        const reports: [string, number, number][] = [
            ["10:00:00", 1000, 244],
            ["10:30:00", 1010, 300],
            ["10:59:59", 1025, 250],
            ["11:00:00", 3, 5],
            ["11:20:00", 8, 5],
        ];
        for (const [time, energyCounterWh, watts] of reports) {
            await recordRoomPower(placed({ energyCounterWh, watts }), new Date(`2026-10-01T${time}Z`));
        }

        const hours = await roomPowerHoursCollection!.find().sort({ hour: 1 }).toArray();

        // 10h: 0 at first sight, +10, +15. 11h: reset (+3), +5.
        expect(hours.map((h) => [h.hour.toISOString(), h.energyWh, h.maxWatts, h.reports])).toEqual([
            ["2026-10-01T10:00:00.000Z", 25, 300, 3],
            ["2026-10-01T11:00:00.000Z", 8, 5, 2],
        ]);
    });

    it("places plugs by the venue list, each venue seeing only its own", async () => {
        await report(plugOne());
        await report(plugOne({ plug: 2, deviceId: "shellyplugsg3-ddeeff", watts: 20 }));
        await report(plugOne({ plug: 3, deviceId: "shellyplugsg3-000000" }));

        const room = (await getMeterSnapshot("museum-oslo")).room;

        expect(room.map((r) => [r.plug, r.label, r.watts])).toEqual([[1, "Projector", 244], [2, "Sound", 20]]);
    });

    it("leaves out readings stored before plugs were numbered", async () => {
        await report(plugOne());
        await roomPowerCollection!.insertOne({
            _id: "museum-oslo|legacy", venueId: "museum-oslo", label: "Projector2", watts: 8, energyWh: 7, updatedAt: new Date(),
        } as never);

        const room = (await getMeterSnapshot("museum-oslo")).room;

        expect(room.map((r) => r.label)).toEqual(["Projector"]);
    });

    it("counts a moved plug at its new venue from zero, leaving its energy with the old one", async () => {
        await report(plugOne({ energyCounterWh: 1000 }));
        await report(plugOne({ energyCounterWh: 1010 }));
        mockConfig.venues = [venue("museum-oslo", []), venue("elsewhere", [{ plug: 1, label: "Television" }])];
        await report(plugOne({ energyCounterWh: 1030 }));
        await report(plugOne({ energyCounterWh: 1035 }));

        const [oslo] = (await getMeterSnapshot("museum-oslo")).room;
        const [elsewhere] = (await getMeterSnapshot("elsewhere")).room;

        expect(oslo).toMatchObject({ plug: 1, label: "Projector", energyWh: 10 });
        expect(elsewhere).toMatchObject({ plug: 1, label: "Television", energyWh: 5 });
    });

    it.each([
        { name: "refuses a second Shelly with the same number while the first still reports", gapMs: 5_000, takenOver: false },
        { name: "lets another Shelly take a number over once the first has fallen silent", gapMs: 25_000, takenOver: true },
    ])("$name", async ({ gapMs, takenOver }) => {
        const first = new Date("2026-10-01T10:00:00Z");
        await recordRoomPower(placed({ energyCounterWh: 1000 }), first);
        await recordRoomPower(placed({ energyCounterWh: 1010 }), first);

        // The other Shelly's own counter is far ahead: only a baseline, never energy used here.
        const result = await recordRoomPower(
            placed({ deviceId: "shellyplugsg3-replacement", energyCounterWh: 5000 }),
            new Date(first.getTime() + gapMs),
        );

        expect(result).toEqual(takenOver
            ? { reading: expect.objectContaining({ plug: 1, energyWh: 10 }) }
            : { numberTakenBy: "shellyplugsg3-aabbcc" });
    });

    it("tells live subscribers about each reading", async () => {
        const seen: RoomPowerReading[] = [];
        const listener = (reading: RoomPowerReading) => seen.push(reading);
        meterEvents.on("roomPower", listener);

        await report(plugOne());
        meterEvents.off("roomPower", listener);

        expect(seen).toEqual([expect.objectContaining({ plug: 1, label: "Projector", watts: 244, energyWh: 0 })]);
    });
});
