import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "http";
import {
    _resetClientLogRateLimitsForTests,
    CLIENT_LOG_BATCHES_PER_MINUTE,
    registerClientLogRoutes,
} from "@api/clientLogRoutes.js";
import { clientLogCollection } from "@services/DbService.js";
import type { Venue } from "@models/Venues.js";
import { CLIENT_LOG_LIMITS, type ClientLogBatch } from "@shared/ClientLogTypes.js";

const mockConfig = vi.hoisted(() => ({ venues: undefined as unknown }));

vi.mock("@root/src/config.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@root/src/config.js")>();
    return {
        config: new Proxy(actual.config, {
            get: (target, prop) => {
                if (prop === "COUNCIL_VENUES") return mockConfig.venues;
                return Reflect.get(target, prop);
            },
        }),
    };
});

const VENUE: Venue = {
    id: "museum-oslo",
    name: "Museum",
    alertEmails: ["staff@example.org"],
    timezone: "Europe/Stockholm",
    openingHours: { days: ["wed"], from: "12:00", to: "16:00" },
};

const PAGE_ID = "0b6f7a52-3c1d-4e8f-9a2b-1c2d3e4f5a6b";
const SETUP_ID = "5d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6";

function batch(overrides: Partial<ClientLogBatch> = {}): ClientLogBatch {
    return {
        pageId: PAGE_ID,
        seq: 0,
        venueId: "museum-oslo",
        lines: [
            { t: Date.now(), cat: "TURN", msg: "IN response.created", data: { reason: "greeting" }, ctx: { setupId: SETUP_ID } },
            { t: Date.now(), cat: "SOCKET", msg: "conversation_update", ctx: { meetingId: 42 } },
        ],
        ...overrides,
    };
}

describe("POST /api/client-log (integration)", () => {
    let httpServer: http.Server;
    let base: string;

    beforeAll(async () => {
        const app = express();
        app.use(express.json());
        registerClientLogRoutes(app);
        httpServer = http.createServer(app);
        await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
        base = `http://127.0.0.1:${(httpServer.address() as { port: number }).port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    });

    beforeEach(() => {
        mockConfig.venues = [VENUE];
        _resetClientLogRateLimitsForTests();
    });

    const post = (body: unknown) =>
        fetch(`${base}/api/client-log`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });

    it("stores a batch with the setups and meetings its lines belong to", async () => {
        const response = await post(batch());

        expect(response.status).toBe(204);
        const stored = await clientLogCollection!.find().toArray();
        expect(stored).toHaveLength(1);
        expect(stored[0]).toMatchObject({
            pageId: PAGE_ID,
            seq: 0,
            venueId: "museum-oslo",
            setupIds: [SETUP_ID],
            meetingIds: [42],
        });
        expect(stored[0].lines.map((line) => line.msg)).toEqual(["IN response.created", "conversation_update"]);
    });

    it("keeps the log in a capped collection, so it rolls over instead of growing", async () => {
        expect(await clientLogCollection!.isCapped()).toBe(true);
    });

    /** The endpoint is open: anything not shaped exactly like our client's batches is refused. */
    it.each([
        { name: "an unknown field on the batch", body: { ...batch(), extra: 1 } },
        { name: "an unknown field on a line", body: batch({ lines: [{ t: Date.now(), cat: "TURN", msg: "x", extra: 1 } as never] }) },
        { name: "an unknown category", body: batch({ lines: [{ t: Date.now(), cat: "DEBUG" as never, msg: "x" }] }) },
        { name: "a page id that is not ours", body: batch({ pageId: "not-a-uuid" }) },
        { name: "a setup id that is not ours", body: batch({ lines: [{ t: Date.now(), cat: "TURN", msg: "x", ctx: { setupId: "abc" } }] }) },
        { name: "an overlong message", body: batch({ lines: [{ t: Date.now(), cat: "TURN", msg: "x".repeat(CLIENT_LOG_LIMITS.maxMessageChars + 1) }] }) },
        { name: "oversized data", body: batch({ lines: [{ t: Date.now(), cat: "TURN", msg: "x", data: "y".repeat(CLIENT_LOG_LIMITS.maxDataChars) }] }) },
        { name: "too many lines", body: batch({ lines: Array.from({ length: CLIENT_LOG_LIMITS.maxLines + 1 }, () => ({ t: Date.now(), cat: "TURN" as const, msg: "x" })) }) },
        { name: "no lines", body: batch({ lines: [] }) },
        { name: "a clock far from the server's", body: batch({ lines: [{ t: Date.now() - CLIENT_LOG_LIMITS.maxClockSkewMs - 60_000, cat: "TURN", msg: "x" }] }) },
        { name: "a venue that is not configured", body: batch({ venueId: "somewhere-else" }) },
    ])("refuses $name", async ({ body }) => {
        const response = await post(body);

        expect(response.status).toBe(400);
        expect(await clientLogCollection!.countDocuments()).toBe(0);
    });

    it("turns a sender away once it has sent its batches for the minute", async () => {
        for (let i = 0; i < CLIENT_LOG_BATCHES_PER_MINUTE; i++) {
            expect((await post(batch({ seq: i }))).status).toBe(204);
        }

        const response = await post(batch({ seq: CLIENT_LOG_BATCHES_PER_MINUTE }));

        expect(response.status).toBe(429);
        expect(await clientLogCollection!.countDocuments()).toBe(CLIENT_LOG_BATCHES_PER_MINUTE);
    });
});
