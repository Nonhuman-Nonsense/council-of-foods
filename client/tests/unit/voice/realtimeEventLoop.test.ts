import { describe, it, expect, vi } from "vitest";
import { createEventLoop } from "@voice/realtimeEventLoop";
import type { RealtimeSessionConfig } from "@realtime/realtimeProtocol";
import type { ToolHandler } from "@voice/guideTools";

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

    it("skips response.create when a tool returns suppressContinuation", async () => {
        const send = vi.fn();
        const handler = vi.fn<ToolHandler>(() => ({ ok: true, suppressContinuation: true }));
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: { resume_meeting: handler } }),
            callbacks: {
                onCaption: vi.fn(),
                onUserTranscript: vi.fn(),
                onError: vi.fn(),
                log: vi.fn(),
            },
        });

        loop.configureSession(makeSession(), { triggerGreetingOnReady: false });
        await loop.handleEvent({ type: "session.updated" });
        await loop.handleEvent({ type: "response.created" });

        send.mockClear();

        await loop.handleEvent({
            type: "response.output_item.added",
            item: { type: "function_call", id: "item-term", call_id: "call-term", name: "resume_meeting" },
        });
        await loop.handleEvent({
            type: "response.function_call_arguments.done",
            item_id: "item-term",
            arguments: "{}",
        });

        const sentTypes = send.mock.calls.map((c) => (c[0] as { type: string }).type);
        expect(sentTypes).not.toContain("response.create");
        expect(sentTypes).toContain("response.cancel");
    });

    it("supports deferred response creation, manual messages, and ignores unknown events", async () => {
        const send = vi.fn();
        const log = vi.fn();
        const onSessionReady = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: {
                onCaption: vi.fn(),
                onUserTranscript: vi.fn(),
                onError: vi.fn(),
                onSessionReady,
                log,
            },
        });

        expect(loop.isResponseActive()).toBe(false);
        expect(loop.requestResponseIfIdle()).toBe(false);

        loop.sendUserMessage("hello there");
        expect(send).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                type: "conversation.item.create",
                item: expect.objectContaining({
                    role: "user",
                    content: [{ type: "input_text", text: "hello there" }],
                }),
            })
        );

        await expect(loop.handleEvent(null)).resolves.toBe(false);
        await expect(loop.handleEvent({ nope: true })).resolves.toBe(false);

        await loop.handleEvent({ type: "session.updated" });
        expect(onSessionReady).toHaveBeenCalledOnce();
        expect(send).toHaveBeenNthCalledWith(2, { type: "response.create" });

        await loop.handleEvent({ type: "response.created" });
        expect(loop.isResponseActive()).toBe(true);
        expect(loop.requestResponseIfIdle()).toBe(false);
        expect(log).toHaveBeenCalledWith("skip response.create: already active", { activeResponses: 1 });
    });

    it("handles caption, user transcript, error, and VAD events", async () => {
        const send = vi.fn();
        const onCaption = vi.fn();
        const onUserTranscript = vi.fn();
        const onError = vi.fn();
        const onAudioPartReady = vi.fn();
        const onResponseStarted = vi.fn();
        const onResponseDone = vi.fn();
        const captionScheduler = {
            beginResponse: vi.fn(),
            appendDelta: vi.fn(),
            finalize: vi.fn(),
            cancel: vi.fn(),
            setAudioAnchor: vi.fn(),
            setSpeed: vi.fn(),
        };

        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: {
                onCaption,
                onUserTranscript,
                onError,
                onAudioPartReady,
                onResponseStarted,
                onResponseDone,
                log: vi.fn(),
            },
            captionScheduler,
        });

        loop.configureSession(makeSession());
        await loop.handleEvent({ type: "session.updated" });
        await loop.handleEvent({ type: "response.created" });
        await loop.handleEvent({ type: "response.content_part.added", part: { type: "audio" } });
        await loop.handleEvent({ type: "response.output_audio_transcript.delta", delta: "hello" });
        await loop.handleEvent({ type: "response.output_audio_transcript.done", transcript: "hello world" });
        await loop.handleEvent({
            type: "conversation.item.input_audio_transcription.completed",
            transcript: "I have a question",
        });
        await loop.handleEvent({ type: "input_audio_buffer.speech_started" });
        await loop.handleEvent({ type: "input_audio_buffer.speech_stopped" });
        await loop.handleEvent({
            type: "error",
            error: { message: "bad", code: "boom", param: "x", type: "server_error" },
        });
        await loop.handleEvent({ type: "response.done", response: { status: "failed", status_details: { why: 1 } } });
        await loop.handleEvent({ type: "error", error: "just a string" });

        expect(onResponseStarted).toHaveBeenCalledOnce();
        expect(onResponseDone).toHaveBeenCalledOnce();
        expect(captionScheduler.beginResponse).toHaveBeenCalledOnce();
        expect(onAudioPartReady).toHaveBeenCalledOnce();
        expect(captionScheduler.appendDelta).toHaveBeenCalledWith("hello");
        expect(captionScheduler.finalize).toHaveBeenCalledWith("hello world");
        expect(onUserTranscript).toHaveBeenCalledWith("I have a question");
        expect(captionScheduler.cancel).toHaveBeenCalledTimes(3);
        expect(onError).toHaveBeenNthCalledWith(1, "bad | code=boom | param=x | type=server_error");
        expect(onError).toHaveBeenNthCalledWith(2, "just a string");
    });

    it("falls back without a caption scheduler and handles missing tool handlers", async () => {
        const send = vi.fn();
        const onCaption = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: {
                onCaption,
                onUserTranscript: vi.fn(),
                onError: vi.fn(),
            },
        });

        loop.configureSession(makeSession());
        await loop.handleEvent({ type: "session.updated" });
        await loop.handleEvent({ type: "response.output_audio_transcript.delta", delta: "" });
        await loop.handleEvent({ type: "response.output_audio_transcript.done", transcript: "spoken answer" });
        await loop.handleEvent({
            type: "conversation.item.input_audio_transcription.completed",
            transcript: "   ",
        });
        await loop.handleEvent({
            type: "response.output_item.added",
            item: { type: "function_call", id: "item-2", name: "missing_tool" },
        });
        await loop.handleEvent({
            type: "response.function_call_arguments.done",
            item_id: "item-2",
            arguments: "{bad json",
        });
        await loop.handleEvent({
            type: "response.function_call_arguments.done",
            item_id: "missing-meta",
            arguments: JSON.stringify({ x: 1 }),
        });
        await loop.handleEvent({ type: "response.done", response: { status: "cancelled" } });

        expect(onCaption).toHaveBeenNthCalledWith(1, "spoken answer");
        const outputCall = send.mock.calls.find(
            (c) => (c[0] as { item?: { type?: string } }).item?.type === "function_call_output"
        );
        expect(outputCall).toBeDefined();
        expect(JSON.parse((outputCall![0] as { item: { output: string } }).item.output)).toEqual({
            ok: false,
            error: "No handler for tool: missing_tool",
        });
    });
});
