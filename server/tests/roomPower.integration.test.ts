import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "http";
import { registerRoomPowerRoutes, ROOM_POWER_KEY_HEADER } from "@api/roomPowerRoutes.js";
import { getMeterSnapshot } from "@api/meterRoutes.js";
import { roomPowerCollection } from "@services/DbService.js";
import { onRoomPowerRecorded } from "@services/RoomPowerService.js";
import type { RoomPowerReading, RoomPowerReport } from "@shared/MeterTypes.js";

const KEY = "room-power-key-for-tests-0123";

const mockKey = vi.hoisted(() => ({ value: "room-power-key-for-tests-0123" as string | undefined }));

vi.mock("@root/src/config.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@root/src/config.js")>();
    return {
        config: new Proxy(actual.config, {
            get: (target, prop) => (prop === "COUNCIL_ROOM_POWER_KEY" ? mockKey.value : Reflect.get(target, prop)),
        }),
    };
});

function projector(overrides: Partial<RoomPowerReport> = {}): RoomPowerReport {
    return {
        venueId: "museum-oslo",
        deviceId: "shellyplugsg3-aabbcc",
        label: "Projector",
        watts: 244,
        energyCounterWh: 1000,
        ...overrides,
    };
}

describe("POST /api/room-power (integration)", () => {
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
        mockKey.value = KEY;
        await roomPowerCollection?.deleteMany({});
    });

    function report(body: unknown, key: string | null = KEY) {
        return fetch(`${base}/api/room-power`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(key !== null ? { [ROOM_POWER_KEY_HEADER]: key } : {}) },
            body: JSON.stringify(body),
        });
    }

    it.each([
        { name: "no key is configured", configured: undefined, key: KEY, status: 503 },
        { name: "the key is missing", configured: KEY, key: null, status: 401 },
        { name: "the key is wrong", configured: KEY, key: "not-the-key-at-all-000000", status: 401 },
    ])("refuses a report when $name", async ({ configured, key, status }) => {
        mockKey.value = configured;

        expect((await report(projector(), key)).status).toBe(status);
        expect(await roomPowerCollection!.countDocuments()).toBe(0);
    });

    it("rejects an implausible reading", async () => {
        expect((await report(projector({ watts: 50_000 }))).status).toBe(400);
    });

    it("accumulates energy from the plug's counter, across a counter reset", async () => {
        for (const energyCounterWh of [1000, 1010, 1025, 3, 8]) {
            expect((await report(projector({ energyCounterWh }))).status).toBe(204);
        }

        const [reading] = (await getMeterSnapshot("museum-oslo")).room;
        // 0 at first sight, +10, +15, reset (+3), +5
        expect(reading).toMatchObject({ label: "Projector", watts: 244, energyWh: 33 });
    });

    it("keeps one reading per plug and only the venue's own", async () => {
        await report(projector());
        await report(projector({ deviceId: "shellyplugsg3-ddeeff", label: "Sound", watts: 20 }));
        await report(projector({ venueId: "elsewhere", deviceId: "shellyplugsg3-000000" }));

        const room = (await getMeterSnapshot("museum-oslo")).room;

        expect(room.map((r) => [r.label, r.watts])).toEqual([["Projector", 244], ["Sound", 20]]);
    });

    it("tells live subscribers about each reading", async () => {
        const seen: RoomPowerReading[] = [];
        const unsubscribe = onRoomPowerRecorded((reading) => seen.push(reading));

        await report(projector());
        unsubscribe();

        expect(seen).toEqual([expect.objectContaining({ deviceId: "shellyplugsg3-aabbcc", watts: 244, energyWh: 0 })]);
    });
});
