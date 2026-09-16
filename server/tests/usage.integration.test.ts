import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "http";
import { Server } from "socket.io";
import { io as connect, type Socket } from "socket.io-client";
import type { UsageEvent, UsageRecord } from "@shared/UsageTypes.js";
import { METER_NAMESPACE, METER_USAGE_EVENT, type MeterUsageEvent } from "@shared/MeterTypes.js";
import { meetingsCollection, usageEventsCollection, usageTotalsCollection } from "@services/DbService.js";
import { getMeterSnapshot, registerMeterSocket } from "@api/meterRoutes.js";
import { MockFactory } from "./factories/MockFactory.js";
import { onUsageRecorded, parseChatCompletionUsage, recordUsage } from "@services/UsageService.js";

function dialogue(overrides: Partial<UsageRecord> = {}): UsageRecord {
    return {
        source: "server",
        feature: "dialogue",
        provider: "inworld",
        model: "mistral/mistral-large-3",
        measures: { input_tokens: 100, output_tokens: 40, request_seconds: 1.5 },
        meetingId: 7,
        ...overrides,
    };
}

describe("usage recording", () => {
    beforeEach(async () => {
        await usageEventsCollection?.deleteMany({});
        await usageTotalsCollection?.deleteMany({});
    });

    it("sums raw measures per model into the global and installation totals", async () => {
        await recordUsage(dialogue({ installationId: "museum-oslo" }));
        await recordUsage(dialogue({ installationId: "museum-oslo" }));
        await recordUsage(dialogue());

        const totals = await usageTotalsCollection?.find({}).sort({ _id: 1 }).toArray();
        expect(totals).toEqual([
            {
                _id: "global|inworld|mistral/mistral-large-3",
                scope: "global",
                provider: "inworld",
                model: "mistral/mistral-large-3",
                requests: 3,
                measures: { input_tokens: 300, output_tokens: 120, request_seconds: 4.5 },
            },
            {
                _id: "installation:museum-oslo|inworld|mistral/mistral-large-3",
                scope: "installation:museum-oslo",
                provider: "inworld",
                model: "mistral/mistral-large-3",
                requests: 2,
                measures: { input_tokens: 200, output_tokens: 80, request_seconds: 3 },
            },
        ]);
        expect(await usageEventsCollection?.countDocuments()).toBe(3);
    });

    it("stores nothing when a call reports no positive usage", async () => {
        await recordUsage(dialogue({ measures: { output_tokens: 0, input_tokens: Number.NaN } }));

        expect(await usageEventsCollection?.countDocuments()).toBe(0);
        expect(await usageTotalsCollection?.countDocuments()).toBe(0);
    });

    it("notifies live subscribers once the usage is stored", async () => {
        const seen: UsageEvent[] = [];
        const unsubscribe = onUsageRecorded((event) => seen.push(event));

        await recordUsage(dialogue({ installationId: "museum-oslo" }));
        unsubscribe();
        await recordUsage(dialogue());

        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({ installationId: "museum-oslo", measures: { output_tokens: 40 } });
    });
});

describe("meter", () => {
    beforeEach(async () => {
        await usageEventsCollection?.deleteMany({});
        await usageTotalsCollection?.deleteMany({});
    });

    it("snapshots global, installation and latest-meeting usage", async () => {
        for (const _id of [11, 12]) {
            await meetingsCollection.insertOne(MockFactory.createStoredMeeting({ _id, liveKey: `key-${_id}`, installationId: "museum-oslo" }));
        }
        await recordUsage(dialogue({ meetingId: 11, installationId: "museum-oslo" }));
        await recordUsage(dialogue({ meetingId: 12, installationId: "museum-oslo" }));
        await recordUsage(dialogue({ meetingId: 12, installationId: "museum-oslo", measures: { output_tokens: 10 } }));
        await recordUsage(dialogue({ meetingId: 99 }));

        const snapshot = await getMeterSnapshot("museum-oslo");

        const row = (requests: number, measures: object) => ({
            provider: "inworld", model: "mistral/mistral-large-3", requests, measures,
        });
        expect(snapshot).toEqual({
            global: [row(4, { input_tokens: 300, output_tokens: 130, request_seconds: 4.5 })],
            installation: [row(3, { input_tokens: 200, output_tokens: 90, request_seconds: 3 })],
            meeting: { meetingId: 12, totals: [row(2, { input_tokens: 100, output_tokens: 50, request_seconds: 1.5 })] },
        });
    });

    describe("live push", () => {
        let httpServer: http.Server;
        let unregister: () => void;
        let socket: Socket;

        beforeEach(async () => {
            httpServer = http.createServer();
            const io = new Server(httpServer);
            unregister = registerMeterSocket(io);
            await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
            const { port } = httpServer.address() as { port: number };
            socket = connect(`http://127.0.0.1:${port}${METER_NAMESPACE}`, { transports: ["websocket"] });
            await new Promise<void>((resolve) => socket.on("connect", () => resolve()));
        });

        afterEach(async () => {
            socket.close();
            unregister();
            await new Promise<void>((resolve) => httpServer.close(() => resolve()));
        });

        it("pushes each recorded usage to connected meters", async () => {
            const received = new Promise<MeterUsageEvent>((resolve) => socket.on(METER_USAGE_EVENT, resolve));

            await recordUsage(dialogue({ installationId: "museum-oslo" }));

            expect(await received).toMatchObject({
                provider: "inworld",
                model: "mistral/mistral-large-3",
                installationId: "museum-oslo",
                measures: { output_tokens: 40 },
                ts: expect.any(String),
            });
        });
    });
});

describe("parseChatCompletionUsage", () => {
    it.each([
        {
            name: "router response",
            usage: { prompt_tokens: 9, completion_tokens: 12, prompt_tokens_details: { cached_tokens: 0 }, total_tokens: 21 },
            expected: { input_tokens: 9, output_tokens: 12 },
        },
        {
            name: "cached, reasoning and audio details",
            usage: {
                prompt_tokens: 50,
                completion_tokens: 30,
                prompt_tokens_details: { cached_tokens: 20, audio_tokens: 5 },
                completion_tokens_details: { reasoning_tokens: 10, audio_tokens: 8 },
            },
            expected: {
                input_tokens: 50,
                output_tokens: 30,
                cached_input_tokens: 20,
                input_audio_tokens: 5,
                reasoning_tokens: 10,
                output_audio_tokens: 8,
            },
        },
        { name: "missing usage", usage: undefined, expected: {} },
        { name: "unexpected shape", usage: "12 tokens", expected: {} },
    ])("reads $name", ({ usage, expected }) => {
        expect(parseChatCompletionUsage(usage)).toEqual(expected);
    });
});
