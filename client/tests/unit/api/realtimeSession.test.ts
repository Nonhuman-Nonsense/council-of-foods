import { describe, it, expect, vi, afterEach } from "vitest";
import {
    bootstrapHumanInputRealtimeSession,
    createHumanInputRealtimeCall,
} from "@api/realtimeSession";

describe("realtimeSession api", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("POSTs realtime bootstrap with liveKey auth", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    provider: "inworld",
                    iceServers: [],
                    session: { type: "realtime" },
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }
            )
        );
        vi.stubGlobal("fetch", fetchMock);

        const result = await bootstrapHumanInputRealtimeSession({ feature: "human-input", language: "en" }, "creator-secret");

        expect(result.provider).toBe("inworld");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/realtime/bootstrap",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    "Content-Type": "application/json",
                    Authorization: "Bearer creator-secret",
                }),
                body: JSON.stringify({ feature: "human-input", language: "en" }),
            })
        );
    });

    it("POSTs realtime call payload with provider and liveKey auth", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ sdp: "mock-answer" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        const result = await createHumanInputRealtimeCall(
            {
                feature: "human-input",
                provider: "inworld",
                sdp: "mock-offer",
                session: { type: "transcription" },
            },
            "creator-secret"
        );

        expect(result.sdp).toBe("mock-answer");
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/realtime/call",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    Authorization: "Bearer creator-secret",
                }),
                body: JSON.stringify({
                    feature: "human-input",
                    provider: "inworld",
                    sdp: "mock-offer",
                    session: { type: "transcription" },
                }),
            })
        );
    });

    it("throws response text when bootstrap fails", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 403 })));

        await expect(
            bootstrapHumanInputRealtimeSession({ feature: "human-input", language: "en" }, "bad-key")
        ).rejects.toThrow("nope");
    });

    it("falls back to a status-based message when the bootstrap error body is empty", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 503 })));

        await expect(
            bootstrapHumanInputRealtimeSession({ feature: "human-input", language: "en" }, "bad-key")
        ).rejects.toThrow("Realtime bootstrap failed (503)");
    });

    it("throws a status-based message when realtime call creation fails without a body", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 502 })));

        await expect(
            createHumanInputRealtimeCall(
                {
                    feature: "human-input",
                    provider: "inworld",
                    sdp: "mock-offer",
                    session: { type: "realtime" },
                },
                "creator-secret"
            )
        ).rejects.toThrow("Realtime call failed (502)");
    });
});
