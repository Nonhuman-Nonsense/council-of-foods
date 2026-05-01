import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchRealtimeBootstrap } from "@realtime/realtimeConnection";

describe("realtimeConnection", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("bootstraps via the shared realtime endpoint", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({
                    provider: "inworld",
                    iceServers: [{ urls: ["stun:guide.example.com"] }],
                    session: {
                        type: "realtime",
                        model: "test-model",
                        output_modalities: ["audio", "text"],
                        audio: {},
                    },
                }),
                {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                }
            )
        );
        vi.stubGlobal("fetch", fetchMock);

        const result = await fetchRealtimeBootstrap({ feature: "voice-guide" });

        expect(result.provider).toBe("inworld");
        expect(result.iceServers).toEqual([{ urls: ["stun:guide.example.com"] }]);
        expect(fetchMock).toHaveBeenCalledWith(
            "/api/realtime/bootstrap",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    "Content-Type": "application/json",
                }),
                body: JSON.stringify({ feature: "voice-guide" }),
                signal: expect.any(AbortSignal),
            })
        );
    });
});
