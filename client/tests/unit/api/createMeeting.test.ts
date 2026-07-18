import { describe, it, expect, vi, afterEach } from "vitest";
import { createMeeting } from "@api/createMeeting";
import { MockFactory } from "../factories/MockFactory";
import type { CreateMeetingBody } from "@shared/SocketTypes";

/**
 * Covers `POST /api/meetings` — the call that starts every meeting:
 *   - request shape (JSON content-type, serialized body)
 *   - 200 body's string/number meetingId is coerced to a number for callers
 *   - non-OK responses surface the server's `{ message }` (falling back to a
 *     status-based message), matching the resumeMeeting/other api/* conventions.
 */
describe("createMeeting", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const body: CreateMeetingBody = {
        topic: MockFactory.createTopic({ id: "t", title: "T", description: "D", prompt: "P" }),
        characters: [MockFactory.createCharacter({ id: "speaker1", name: "Speaker 1" })],
        language: "en",
    };

    it("POSTs JSON and returns meetingId coerced to a number", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ meetingId: "42", liveKey: "live-key-1" }), {
                status: 201,
                headers: { "Content-Type": "application/json" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const result = await createMeeting(body);

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/meetings",
            expect.objectContaining({
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            }),
        );
        expect(result).toEqual({ meetingId: 42, liveKey: "live-key-1" });
    });

    it("passes through a numeric meetingId unchanged", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ meetingId: 7, liveKey: "k" }), {
                    status: 201,
                    headers: { "Content-Type": "application/json" },
                }),
            ),
        );

        const result = await createMeeting(body);
        expect(result.meetingId).toBe(7);
    });

    it("throws the server's error message on a non-OK response", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ message: "Invalid topic" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                }),
            ),
        );

        await expect(createMeeting(body)).rejects.toThrow("Invalid topic");
    });

    it("falls back to a status-based message when the error body isn't JSON", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 500 })));

        await expect(createMeeting(body)).rejects.toThrow("Create meeting failed (500)");
    });
});
