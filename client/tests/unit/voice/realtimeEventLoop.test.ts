import { describe, it, expect, vi } from "vitest";
import { createEventLoop } from "@/voice/realtimeEventLoop";
import type { RealtimeSessionConfig } from "@/voice/realtimeProtocol";
import type { ToolHandler } from "@/voice/guideTools";

function makeSession(): RealtimeSessionConfig {
    return {
        type: "realtime",
        model: "google-ai-studio/gemini-2.5-flash",
        instructions: "Be helpful.",
        output_modalities: ["audio", "text"],
        tools: [
            {
                type: "function",
                name: "select_topic",
                description: "Select a topic by id.",
                parameters: {
                    type: "object",
                    additionalProperties: false,
                    properties: { topicId: { type: "string" } },
                    required: ["topicId"],
                },
            },
        ],
        audio: {
            input: {
                turn_detection: {
                    type: "semantic_vad",
                    eagerness: "medium",
                    create_response: true,
                    interrupt_response: true,
                },
            },
            output: { voice: "Pippa", model: "inworld-tts-1.5-mini", speed: 1.0 },
        },
    };
}

describe("realtimeEventLoop", () => {
    /**
     * Why this matters: Inworld's WebRTC docs say session.created leaves the
     * session at defaults. If we send response.create before session.updated
     * the model has no instructions/tools and we get server_error or
     * tool-less chitchat (both observed in production logs).
     */
    it("delays response.create until session.updated when greeting is queued", () => {
        const send = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: {
                onCaption: vi.fn(),
                onUserTranscript: vi.fn(),
                onError: vi.fn(),
            },
        });

        loop.configureSession(makeSession(), { triggerGreetingOnReady: true });

        const sentTypes = () => send.mock.calls.map((c) => (c[0] as { type: string }).type);
        expect(sentTypes()).toEqual(["session.update"]);

        void loop.handleEvent({ type: "session.created" });
        expect(sentTypes()).toEqual(["session.update"]);

        void loop.handleEvent({ type: "session.updated" });
        expect(sentTypes()).toEqual([
            "session.update",
            "conversation.item.create",
            "response.create",
        ]);
    });

    /**
     * If a response is mid-flight when session.updated arrives, we must not
     * pile a second response.create on top — that's the cancel-cascade bug.
     */
    it("does not stack response.create if a response is already in flight", () => {
        const send = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: {
                onCaption: vi.fn(),
                onUserTranscript: vi.fn(),
                onError: vi.fn(),
            },
        });

        loop.configureSession(makeSession(), { triggerGreetingOnReady: true });
        void loop.handleEvent({ type: "response.created" });
        void loop.handleEvent({ type: "session.updated" });

        const sentTypes = send.mock.calls.map((c) => (c[0] as { type: string }).type);
        expect(sentTypes).toEqual(["session.update"]);
    });

    /**
     * Function call dispatch must read from getCtx() each time, so handlers
     * always see fresh wizard state (the bug behind 'confirm_topic' silently
     * failing on the previous-render's empty selection).
     */
    it("dispatches function calls with the latest handlers from getCtx()", async () => {
        const send = vi.fn();
        const handlerV1 = vi.fn<ToolHandler>(() => ({ ok: true }));
        const handlerV2 = vi.fn<ToolHandler>(() => ({ ok: true }));
        let currentHandlers: Record<string, ToolHandler> = { select_topic: handlerV1 };

        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: currentHandlers }),
            callbacks: {
                onCaption: vi.fn(),
                onUserTranscript: vi.fn(),
                onError: vi.fn(),
            },
        });

        loop.configureSession(makeSession(), { triggerGreetingOnReady: false });
        void loop.handleEvent({ type: "session.updated" });

        currentHandlers = { select_topic: handlerV2 };

        void loop.handleEvent({
            type: "response.output_item.added",
            item: { type: "function_call", id: "item-1", call_id: "call-1", name: "select_topic" },
        });
        await loop.handleEvent({
            type: "response.function_call_arguments.done",
            item_id: "item-1",
            arguments: JSON.stringify({ topicId: "biodiversity" }),
        });

        expect(handlerV1).not.toHaveBeenCalled();
        expect(handlerV2).toHaveBeenCalledWith({ topicId: "biodiversity" });

        const outputCall = send.mock.calls.find(
            (c) => (c[0] as { type: string }).type === "conversation.item.create"
        );
        expect(outputCall).toBeDefined();
        const outputArg = outputCall![0] as { item: { type: string; call_id: string; output: string } };
        expect(outputArg.item).toMatchObject({
            type: "function_call_output",
            call_id: "call-1",
        });
        expect(JSON.parse(outputArg.item.output)).toEqual({ ok: true });
    });
});
