import { describe, it, expect, vi, afterEach } from "vitest";
import { getMeeting } from "@/api/getMeeting";

describe("getMeeting", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("sends Authorization Bearer with the live key", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ _id: 7, topic: { id: "t", title: "T", description: "", prompt: "" } }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );
        vi.stubGlobal("fetch", fetchMock);

        await getMeeting({ meetingId: 7, liveKey: "secret-key" });

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/meetings/7",
            expect.objectContaining({
                method: "GET",
                headers: expect.objectContaining({
                    "Content-Type": "application/json",
                    Authorization: "Bearer secret-key",
                }),
            })
        );
    });

    it("forwards AbortSignal when provided", async () => {
        const ac = new AbortController();
        const fetchMock = vi.fn().mockResolvedValue(
            new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } })
        );
        vi.stubGlobal("fetch", fetchMock);

        await getMeeting({ meetingId: 1, liveKey: "k", signal: ac.signal });

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/meetings/1",
            expect.objectContaining({ signal: ac.signal })
        );
    });
});
