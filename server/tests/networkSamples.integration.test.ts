import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "http";
import { registerInstallationRoutes } from "@api/installationRoutes.js";
import { networkSamplesCollection } from "@services/DbService.js";
import type { Venue } from "@models/Venues.js";
import type { NetworkSample, PingStats } from "@shared/networkSamples.js";

const KEY = "installation-key-for-tests-0123";

const VENUE: Venue = {
    id: "example-museum",
    name: "Example Museum",
    alertEmails: ["staff@example.org"],
    timezone: "Europe/Stockholm",
    openingHours: { days: ["wed"], from: "12:00", to: "16:00" },
};

// The DB setup loads errorbot before this file's config mock applies, so reports are caught here.
const sendReport = vi.hoisted(() => vi.fn());
vi.mock("@utils/errorbot.js", () => ({ sendReport }));

vi.mock("@root/src/config.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@root/src/config.js")>();
    const overrides: Record<string, unknown> = {
        COUNCIL_INSTALLATION_KEY: "installation-key-for-tests-0123",
        COUNCIL_VENUES: [{
            id: "example-museum",
            name: "Example Museum",
            alertEmails: ["staff@example.org"],
            timezone: "Europe/Stockholm",
            openingHours: { days: ["wed"], from: "12:00", to: "16:00" },
        }],
    };
    return {
        config: new Proxy(actual.config, {
            get: (target, prop) => (typeof prop === "string" && prop in overrides ? overrides[prop] : Reflect.get(target, prop)),
        }),
    };
});

const ANSWERED: PingStats = { sent: 5, received: 5, avgMs: 20, maxMs: 30, jitterMs: 3 };
const SILENT: PingStats = { sent: 5, received: 0, avgMs: null, maxMs: null, jitterMs: null };
const START = Date.now() - 60 * 60_000;

/** One sample per minute from START: `.` online, `x` no internet with the router answering, `X` router silent too. */
function minutes(pattern: string): NetworkSample[] {
    return [...pattern].map((state, i) => ({
        t: new Date(START + i * 60_000).toISOString(),
        iface: "en0",
        link: "autoselect (1000baseT <full-duplex>)",
        gateway: state === "X" ? SILENT : ANSWERED,
        internet: state === "." ? ANSWERED : SILENT,
        serverMs: state === "." ? 120 : null,
        inErrors: 0,
        outErrors: 0,
    }));
}

describe("POST /api/installation/network (integration)", () => {
    let httpServer: http.Server;
    let base: string;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        registerInstallationRoutes(app);
        httpServer = http.createServer(app);
        await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
        base = `http://127.0.0.1:${(httpServer.address() as { port: number }).port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    beforeEach(() => {
        sendReport.mockReset();
    });

    const post = (body: unknown, key: string | null = KEY) =>
        fetch(`${base}/api/installation/network`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(key ? { "X-Installation-Key": key } : {}) },
            body: JSON.stringify(body),
        });

    function reports(): string[] {
        return sendReport.mock.calls.map(([report]) => report.message);
    }

    it("stores each sample for the venue, by the time it was taken", async () => {
        const response = await post({ venueId: VENUE.id, host: "council-museum.local", samples: minutes("...") });

        expect(response.status).toBe(204);
        const stored = await networkSamplesCollection!.find().sort({ t: 1 }).toArray();
        expect(stored).toHaveLength(3);
        expect(stored[0]).toMatchObject({ venueId: VENUE.id, host: "council-museum.local", serverMs: 120 });
        expect(stored[0].t).toEqual(new Date(START));
        expect(await networkSamplesCollection!.isCapped()).toBe(true);
        expect(reports()).toEqual([]);
    });

    it.each([
        ["the internet connection", "..xxxx..", "router answered"],
        ["the local network", "..XXXX..", "router did not answer"],
    ])("reports an outage of %s to the team, once it is over", async (_name, pattern, cause) => {
        await post({ venueId: VENUE.id, samples: minutes(pattern) });

        const [report] = reports();
        expect(report).toContain("Example Museum");
        expect(report).toContain("(4 min)");
        expect(report).toContain(cause);
    });

    it("lets a single lost minute pass without a report", async () => {
        await post({ venueId: VENUE.id, samples: minutes("..x..") });

        expect(reports()).toEqual([]);
    });

    it.each([
        ["no key", { venueId: VENUE.id, samples: minutes(".") }, null, 401],
        ["an unknown venue", { venueId: "somewhere-else", samples: minutes(".") }, KEY, 400],
        ["no samples", { venueId: VENUE.id, samples: [] }, KEY, 400],
        ["an unknown field", { venueId: VENUE.id, samples: [{ ...minutes(".")[0], extra: 1 }] }, KEY, 400],
        ["a sample older than any backlog", { venueId: VENUE.id, samples: [{ ...minutes(".")[0], t: "2020-01-01T00:00:00.000Z" }] }, KEY, 400],
    ])("refuses a batch with %s", async (_name, body, key, status) => {
        expect((await post(body, key)).status).toBe(status);
        expect(await networkSamplesCollection!.countDocuments()).toBe(0);
    });
});
