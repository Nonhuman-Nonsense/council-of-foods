import { describe, it, expect, vi } from "vitest";
import { createEventLoop } from "@realtime/realtimeEventLoop";
import type { RealtimeSessionConfig } from "@realtime/realtimeProtocol";
import type { ToolHandler } from "@realtime/realtimeTools";

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

type SendMock = ReturnType<typeof vi.fn>;

function responseCreateCalls(send: SendMock): Array<{ type: string; event_id?: string }> {
    return send.mock.calls
        .map((c) => c[0] as { type: string; event_id?: string })
        .filter((payload) => payload.type === "response.create");
}

function responseCreateCount(send: SendMock): number {
    return responseCreateCalls(send).length;
}

/** The `event_id` the provider would echo back when rejecting the latest create. */
function lastResponseCreateEventId(send: SendMock): string {
    const calls = responseCreateCalls(send);
    const eventId = calls[calls.length - 1]?.event_id;
    if (!eventId) throw new Error("No response.create with an event_id has been sent");
    return eventId;
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
     * The session connects long before the browser will let anything be heard,
     * so the greeting waits. Remote audio is a live stream, not a buffer —
     * speaking early loses the words rather than delaying them.
     */
    it("holds the greeting until it is released, then sends it", () => {
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

        loop.configureSession(makeSession(), {
            triggerGreetingOnReady: true,
            holdGreeting: true,
        });

        const sentTypes = () => send.mock.calls.map((c) => (c[0] as { type: string }).type);

        void loop.handleEvent({ type: "session.updated" });
        expect(sentTypes()).toEqual(["session.update"]);

        loop.setGreetingHeld(false);
        expect(sentTypes()).toEqual([
            "session.update",
            "conversation.item.create",
            "response.create",
        ]);
    });

    it("does not send a held greeting before the session is ready", () => {
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

        loop.configureSession(makeSession(), {
            triggerGreetingOnReady: true,
            holdGreeting: true,
        });

        // Released while still handshaking: nothing to send yet.
        loop.setGreetingHeld(false);
        expect(send.mock.calls.map((c) => (c[0] as { type: string }).type)).toEqual([
            "session.update",
        ]);

        void loop.handleEvent({ type: "session.updated" });
        expect(send.mock.calls.map((c) => (c[0] as { type: string }).type)).toEqual([
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

    /**
     * A handler that throws must still yield a function_call_output: without one
     * the model waits forever for a result that never arrives and the agent goes
     * silent mid-conversation, which on an installation is indistinguishable from a hang.
     */
    it.each([
        {
            failureMode: "throws synchronously",
            handler: (): never => {
                throw new Error("network down");
            },
        },
        {
            failureMode: "rejects asynchronously",
            handler: (): Promise<never> => Promise.reject(new Error("network down")),
        },
    ])("sends a function_call_output when a tool handler $failureMode", async ({ handler }) => {
        const send = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: { start_meeting: handler as unknown as ToolHandler } }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError: vi.fn() },
        });

        loop.configureSession(makeSession());
        await loop.handleEvent({ type: "session.updated" });
        await loop.handleEvent({
            type: "response.output_item.added",
            item: { type: "function_call", id: "item-x", call_id: "call-x", name: "start_meeting" },
        });

        await expect(
            loop.handleEvent({
                type: "response.function_call_arguments.done",
                item_id: "item-x",
                arguments: "{}",
            })
        ).resolves.toBe(true);

        const outputCall = send.mock.calls.find(
            (c) => (c[0] as { item?: { type?: string } }).item?.type === "function_call_output"
        );
        expect(outputCall).toBeDefined();
        expect(JSON.parse((outputCall![0] as { item: { output: string } }).item.output)).toEqual({
            ok: false,
            error: "Tool start_meeting failed: network down",
        });
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
        const onSessionReady = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: {
                onCaption: vi.fn(),
                onUserTranscript: vi.fn(),
                onError: vi.fn(),
                onSessionReady,
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
        expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: "response.create" }));

        await loop.handleEvent({ type: "response.created" });
        expect(loop.isResponseActive()).toBe(true);
        expect(loop.requestResponseIfIdle()).toBe(false);
    });

    /**
     * Observed on the first turn after (re)connect + greeting (landing,
     * switch_language): the server auto-creates a response that completes with
     * no output. A fresh response.create against the same context works, so we
     * retry once per user turn.
     */
    it("recovers an empty response by injecting a user text message then response.create", async () => {
        const send = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError: vi.fn() },
        });

        loop.configureSession(makeSession());
        await loop.handleEvent({ type: "session.updated" });
        // A real user turn so the recovery message echoes the transcript.
        await loop.handleEvent({
            type: "conversation.item.input_audio_transcription.completed",
            transcript: "Ja.",
        });
        send.mockClear();

        await loop.handleEvent({ type: "response.created" });
        await loop.handleEvent({ type: "response.done", response: { status: "completed" } });

        // Recovery = inject a user text item, then response.create (mirrors the
        // mechanism proven to work; a bare response.create does not).
        const sentTypes = send.mock.calls.map((c) => (c[0] as { type: string }).type);
        expect(sentTypes).toEqual(["conversation.item.create", "response.create"]);

        const injected = send.mock.calls[0][0] as {
            item: { role: string; content: Array<{ text: string }> };
        };
        expect(injected.item.role).toBe("user");
        expect(injected.item.content[0].text).toContain("Ja.");

        // A second empty response in the same turn must not retry again.
        await loop.handleEvent({ type: "response.created" });
        await loop.handleEvent({ type: "response.done", response: { status: "completed" } });
        const createCount = send.mock.calls.filter(
            (c) => (c[0] as { type: string }).type === "response.create"
        ).length;
        expect(createCount).toBe(1);
    });

    it("does not re-request when the completed response produced output", async () => {
        const send = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError: vi.fn() },
        });

        loop.configureSession(makeSession());
        await loop.handleEvent({ type: "session.updated" });
        send.mockClear();

        await loop.handleEvent({ type: "response.created" });
        await loop.handleEvent({ type: "response.content_part.added", part: { type: "audio" } });
        await loop.handleEvent({ type: "response.done", response: { status: "completed" } });

        const sentTypes = send.mock.calls.map((c) => (c[0] as { type: string }).type);
        expect(sentTypes).not.toContain("response.create");
    });

    it("does not re-request when a response is cancelled (suppressContinuation)", async () => {
        const send = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError: vi.fn() },
        });

        loop.configureSession(makeSession());
        await loop.handleEvent({ type: "session.updated" });
        send.mockClear();

        await loop.handleEvent({ type: "response.created" });
        await loop.handleEvent({ type: "response.done", response: { status: "cancelled" } });

        const sentTypes = send.mock.calls.map((c) => (c[0] as { type: string }).type);
        expect(sentTypes).not.toContain("response.create");
    });

    it("resets the empty-response retry budget on a new user turn", async () => {
        const send = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError: vi.fn() },
        });

        loop.configureSession(makeSession());
        await loop.handleEvent({ type: "session.updated" });
        send.mockClear();

        const createCount = () =>
            send.mock.calls.filter((c) => (c[0] as { type: string }).type === "response.create").length;

        // First turn: empty response → one retry.
        await loop.handleEvent({ type: "response.created" });
        await loop.handleEvent({ type: "response.done", response: { status: "completed" } });
        expect(createCount()).toBe(1);

        // New user turn resets the budget.
        await loop.handleEvent({
            type: "conversation.item.input_audio_transcription.completed",
            transcript: "hello again",
        });

        // Second turn: empty response → retries again.
        await loop.handleEvent({ type: "response.created" });
        await loop.handleEvent({ type: "response.done", response: { status: "completed" } });
        expect(createCount()).toBe(2);
    });

    /**
     * A rejected response.create yields neither response.created nor
     * response.done, so the empty-response recovery above never fires and the
     * visitor's turn dies in silence. Observed shape: the greeting create is
     * rejected with server_error on an empty transcript.
     */
    it.each([
        {
            correlation: "echoes our event_id",
            buildError: (eventId: string) => ({
                event_id: eventId,
                message: "internal error",
                code: "server_error",
            }),
        },
        {
            correlation: "omits event_id but names response.create",
            buildError: () => ({
                message: "response.create failed: conversation is empty",
                code: "server_error",
            }),
        },
    ])("recovers a rejected response.create when the error $correlation", async ({ buildError }) => {
        const send = vi.fn();
        const onError = vi.fn();
        const onNonFatalError = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError, onNonFatalError },
        });

        loop.configureSession(makeSession(), { triggerGreetingOnReady: true });
        await loop.handleEvent({ type: "session.updated" });
        const eventId = lastResponseCreateEventId(send);
        send.mockClear();

        await loop.handleEvent({ type: "error", error: buildError(eventId) });

        const sentTypes = send.mock.calls.map((c) => (c[0] as { type: string }).type);
        expect(sentTypes).toEqual(["conversation.item.create", "response.create"]);
        // Reporting the error as fatal would tear the session down and take
        // the in-flight recovery turn with it — it is surfaced as absorbed.
        expect(onError).not.toHaveBeenCalled();
        expect(onNonFatalError).toHaveBeenCalledWith(
            expect.objectContaining({ handling: "recovered" }),
        );
    });

    it("leaves a pending response.create alone when an unrelated error arrives", async () => {
        const send = vi.fn();
        const onError = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError },
        });

        loop.configureSession(makeSession(), { triggerGreetingOnReady: true });
        await loop.handleEvent({ type: "session.updated" });
        send.mockClear();

        await loop.handleEvent({
            type: "error",
            error: { event_id: "some_other_client_event", message: "microphone glitch" },
        });

        expect(send).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(expect.stringContaining("microphone glitch"));
    });

    it("retries a rejected response.create only once per user turn", async () => {
        const send = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError: vi.fn() },
        });

        loop.configureSession(makeSession(), { triggerGreetingOnReady: true });
        await loop.handleEvent({ type: "session.updated" });
        expect(responseCreateCount(send)).toBe(1);

        await loop.handleEvent({
            type: "error",
            error: { event_id: lastResponseCreateEventId(send), message: "server_error" },
        });
        expect(responseCreateCount(send)).toBe(2);

        // The recovery create is rejected too — stop rather than loop.
        await loop.handleEvent({
            type: "error",
            error: { event_id: lastResponseCreateEventId(send), message: "server_error" },
        });
        expect(responseCreateCount(send)).toBe(2);
    });

    it("resets the rejected-create retry budget on a new user turn", async () => {
        const send = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError: vi.fn() },
        });

        loop.configureSession(makeSession(), { triggerGreetingOnReady: true });
        await loop.handleEvent({ type: "session.updated" });

        // Exhaust the budget on the first turn.
        await loop.handleEvent({
            type: "error",
            error: { event_id: lastResponseCreateEventId(send), message: "server_error" },
        });
        await loop.handleEvent({
            type: "error",
            error: { event_id: lastResponseCreateEventId(send), message: "server_error" },
        });
        const afterFirstTurn = responseCreateCount(send);

        await loop.handleEvent({
            type: "conversation.item.input_audio_transcription.completed",
            transcript: "hello again",
        });
        loop.requestResponseIfIdle();
        await loop.handleEvent({
            type: "error",
            error: { event_id: lastResponseCreateEventId(send), message: "server_error" },
        });

        // The new turn's create plus one fresh recovery.
        expect(responseCreateCount(send)).toBe(afterFirstTurn + 2);
    });

    /**
     * A capacity refusal is the one provider error a reconnect cannot fix: the
     * session is healthy and every slot is taken, so tearing it down loses the
     * conversation and then queues for a slot that is already gone.
     */
    it("keeps the session and retries the turn after a capacity refusal", async () => {
        vi.useFakeTimers();
        const send = vi.fn();
        const onError = vi.fn();
        const onNonFatalError = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError, onNonFatalError },
        });

        loop.configureSession(makeSession(), { triggerGreetingOnReady: true });
        await loop.handleEvent({ type: "session.updated" });
        expect(responseCreateCount(send)).toBe(1);

        await loop.handleEvent({
            type: "error",
            error: {
                event_id: lastResponseCreateEventId(send),
                code: 8,
                message: "request failed: rpc error: code = ResourceExhausted",
            },
        });

        expect(onError).not.toHaveBeenCalled();
        expect(onNonFatalError).toHaveBeenCalledWith(
            expect.objectContaining({ capacity: true, handling: "recovered", code: "8" }),
        );
        // Retrying now would ask for the slot that was just refused.
        expect(responseCreateCount(send)).toBe(1);

        await vi.advanceTimersByTimeAsync(5000);
        expect(responseCreateCount(send)).toBe(2);
        vi.useRealTimers();
    });

    it("does not retry a capacity refusal that arrives while a response is in flight", async () => {
        vi.useFakeTimers();
        const send = vi.fn();
        const onNonFatalError = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError: vi.fn(), onNonFatalError },
        });

        loop.configureSession(makeSession(), { triggerGreetingOnReady: true });
        await loop.handleEvent({ type: "session.updated" });
        await loop.handleEvent({ type: "response.created" });

        await loop.handleEvent({
            type: "error",
            error: { code: 8, message: "maximum allowed number of active contexts reached" },
        });

        // The in-flight response owns the turn; response.done recovers it if it dies.
        expect(onNonFatalError).toHaveBeenCalledWith(
            expect.objectContaining({ capacity: true, handling: "ignored" }),
        );
        await vi.advanceTimersByTimeAsync(5000);
        expect(responseCreateCount(send)).toBe(1);
        vi.useRealTimers();
    });

    it("stops retrying capacity refusals after the per-turn budget", async () => {
        vi.useFakeTimers();
        const send = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError: vi.fn() },
        });

        loop.configureSession(makeSession(), { triggerGreetingOnReady: true });
        await loop.handleEvent({ type: "session.updated" });

        const refuse = async () => {
            await loop.handleEvent({
                type: "error",
                error: { code: 8, message: "ResourceExhausted" },
            });
            await vi.advanceTimersByTimeAsync(5000);
        };

        await refuse();
        await refuse();
        const afterBudget = responseCreateCount(send);
        await refuse();
        expect(responseCreateCount(send)).toBe(afterBudget);

        // A new user turn earns a fresh budget.
        await loop.handleEvent({
            type: "conversation.item.input_audio_transcription.completed",
            transcript: "still there?",
        });
        await refuse();
        expect(responseCreateCount(send)).toBe(afterBudget + 1);
        vi.useRealTimers();
    });

    it("handles caption, user transcript, error, and VAD events", async () => {
        const send = vi.fn();
        const onCaption = vi.fn();
        const onUserTranscript = vi.fn();
        const onError = vi.fn();
        const onAudioPartReady = vi.fn();
        const onResponseStarted = vi.fn();
        const onResponseDone = vi.fn();

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
            },
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
        expect(onAudioPartReady).toHaveBeenCalledOnce();
        expect(onUserTranscript).toHaveBeenCalledWith("I have a question");
        expect(onCaption).toHaveBeenCalledWith(null);
        expect(onError).toHaveBeenNthCalledWith(1, "bad | code=boom | param=x | type=server_error");
        expect(onError).toHaveBeenNthCalledWith(2, "just a string");
    });

    /**
     * Click-reaction barge-in: unlike requestResponseIfIdle, this must always
     * cut off whatever's currently playing rather than silently no-op when
     * a response is active — response.done alone doesn't mean the audio has
     * finished draining on the client, so we clear the server's output buffer.
     */
    it("interruptAndRespond cancels, clears output audio, and responds when a response is active", async () => {
        const send = vi.fn();
        const onCaption = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption, onUserTranscript: vi.fn(), onError: vi.fn() },
        });

        loop.configureSession(makeSession());
        await loop.handleEvent({ type: "session.updated" });
        await loop.handleEvent({ type: "response.created" });
        send.mockClear();
        onCaption.mockClear();

        loop.interruptAndRespond("(click reaction text)", { reason: "click-reaction" });

        const sentTypes = send.mock.calls.map((c) => (c[0] as { type: string }).type);
        expect(sentTypes).toEqual([
            "response.cancel",
            "output_audio_buffer.clear",
            "conversation.item.create",
            "response.create",
        ]);
        // The old caption stays on screen (same as real voice interruption)
        // until the new response starts and clears it naturally.
        expect(onCaption).not.toHaveBeenCalled();
    });

    it("interruptAndRespond skips response.cancel when idle but still clears output audio", async () => {
        const send = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError: vi.fn() },
        });

        loop.configureSession(makeSession());
        await loop.handleEvent({ type: "session.updated" });
        send.mockClear();

        loop.interruptAndRespond("(click reaction text)");

        const sentTypes = send.mock.calls.map((c) => (c[0] as { type: string }).type);
        expect(sentTypes).toEqual([
            "output_audio_buffer.clear",
            "conversation.item.create",
            "response.create",
        ]);
    });

    /**
     * The visitor can click again while the first interrupt's cancel is still
     * in flight. `activeResponses` only predicts the server's state, so a
     * second cancel would be aimed at a response the server has already closed
     * — which it rejects with response_cancel_not_active.
     */
    it("sends only one response.cancel while an earlier cancel is unresolved", async () => {
        const send = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError: vi.fn() },
        });

        loop.configureSession(makeSession());
        await loop.handleEvent({ type: "session.updated" });
        await loop.handleEvent({ type: "response.created" });
        send.mockClear();

        loop.interruptAndRespond("(first click)", { reason: "click-reaction" });
        loop.interruptAndRespond("(second click)", { reason: "click-reaction" });

        const cancels = send.mock.calls.filter((c) => (c[0] as { type: string }).type === "response.cancel");
        expect(cancels).toHaveLength(1);
    });

    it("cancels again once the next response has started", async () => {
        const send = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError: vi.fn() },
        });

        loop.configureSession(makeSession());
        await loop.handleEvent({ type: "session.updated" });
        await loop.handleEvent({ type: "response.created" });
        loop.interruptAndRespond("(first click)", { reason: "click-reaction" });
        await loop.handleEvent({ type: "response.done", response: { status: "cancelled" } });
        await loop.handleEvent({ type: "response.created" });
        send.mockClear();

        loop.interruptAndRespond("(second click)", { reason: "click-reaction" });

        const cancels = send.mock.calls.filter((c) => (c[0] as { type: string }).type === "response.cancel");
        expect(cancels).toHaveLength(1);
    });

    /**
     * A cancel that lands after the server already closed the response is a
     * no-op, not a session failure: reporting it tears the whole session down
     * and reconnects mid-conversation.
     */
    it("ignores a stale response.cancel rejection and frees the response slot", async () => {
        const send = vi.fn();
        const onError = vi.fn();
        const onNonFatalError = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError, onNonFatalError },
        });

        loop.configureSession(makeSession());
        await loop.handleEvent({ type: "session.updated" });
        await loop.handleEvent({ type: "response.created" });
        loop.interruptAndRespond("(click reaction text)", { reason: "click-reaction" });
        send.mockClear();

        await loop.handleEvent({
            type: "error",
            error: {
                type: "invalid_request_error",
                code: "response_cancel_not_active",
                message: "Cancellation failed: no active response found.",
            },
        });

        expect(onError).not.toHaveBeenCalled();
        expect(onNonFatalError).toHaveBeenCalledWith(
            expect.objectContaining({ code: "response_cancel_not_active", handling: "ignored" }),
        );
        // The server said nothing is running, so the loop must believe it:
        // a stuck count would refuse every later response.create.
        expect(loop.isResponseActive()).toBe(false);
        expect(loop.requestResponseIfIdle()).toBe(true);
    });

    /**
     * Only provable no-ops are absorbed. Most request-level rejections strand
     * the session instead — a refused session.update never yields
     * `session.updated`, so the agent would wait for a readiness signal that
     * is never coming. Reconnecting is blunt, but it is a real recovery.
     */
    it.each([
        {
            name: "a stale cancel",
            error: {
                type: "invalid_request_error",
                code: "response_cancel_not_active",
                message: "no active response",
            },
            fatal: false,
        },
        {
            name: "an empty audio commit",
            error: {
                type: "invalid_request_error",
                code: "input_audio_buffer_commit_empty",
                message: "buffer empty",
            },
            fatal: false,
        },
        {
            name: "a rejected session.update",
            error: {
                type: "invalid_request_error",
                code: "invalid_value",
                param: "session.audio.output.voice",
                message: "unknown voice",
            },
            fatal: true,
        },
        {
            name: "a truncate past the end of the audio",
            error: {
                type: "invalid_request_error",
                code: "audio_end_ms_out_of_range",
                message: "audio_end_ms 762 exceeds actual audio duration 599 ms.",
            },
            fatal: false,
        },
        {
            name: "a server error",
            error: { type: "server_error", message: "internal" },
            fatal: true,
        },
        {
            name: "an error with no structure at all",
            error: "just a string",
            fatal: true,
        },
    ])("treats $name as fatal=$fatal", async ({ error, fatal }) => {
        const send = vi.fn();
        const onError = vi.fn();
        const onNonFatalError = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError, onNonFatalError },
        });

        loop.configureSession(makeSession());
        await loop.handleEvent({ type: "session.updated" });

        await loop.handleEvent({ type: "error", error });

        expect(onError).toHaveBeenCalledTimes(fatal ? 1 : 0);
        expect(onNonFatalError).toHaveBeenCalledTimes(fatal ? 0 : 1);
    });

    /**
     * Without truncation, the model's own transcript still says it finished
     * the interrupted sentence even though the visitor only heard part of
     * it — it may then reference things it never actually said out loud.
     */
    it("interruptAndRespond truncates the assistant's audio item to what was actually heard", async () => {
        const send = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError: vi.fn() },
        });

        loop.configureSession(makeSession());
        await loop.handleEvent({ type: "session.updated" });
        await loop.handleEvent({ type: "response.created" });
        await loop.handleEvent({
            type: "response.content_part.added",
            item_id: "item-abc",
            content_index: 0,
            part: { type: "audio" },
        });
        send.mockClear();

        loop.interruptAndRespond("(click reaction text)", { reason: "click-reaction", audioElapsedMs: 1234.7 });

        const truncateCall = send.mock.calls.find(
            (c) => (c[0] as { type: string }).type === "conversation.item.truncate"
        );
        expect(truncateCall).toBeDefined();
        expect(truncateCall![0]).toEqual({
            type: "conversation.item.truncate",
            item_id: "item-abc",
            content_index: 0,
            audio_end_ms: 1234,
        });
    });

    it("interruptAndRespond skips truncate when no audio item is known yet", async () => {
        const send = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError: vi.fn() },
        });

        loop.configureSession(makeSession());
        await loop.handleEvent({ type: "session.updated" });
        send.mockClear();

        loop.interruptAndRespond("(click reaction text)", { audioElapsedMs: 500 });

        const sentTypes = send.mock.calls.map((c) => (c[0] as { type: string }).type);
        expect(sentTypes).not.toContain("conversation.item.truncate");
    });

    it("interruptAndRespond defers response.create until session.updated when session isn't ready", () => {
        const send = vi.fn();
        const loop = createEventLoop({
            send,
            getCtx: () => ({ toolHandlers: {} }),
            callbacks: { onCaption: vi.fn(), onUserTranscript: vi.fn(), onError: vi.fn() },
        });

        loop.interruptAndRespond("(click reaction text)");

        let sentTypes = send.mock.calls.map((c) => (c[0] as { type: string }).type);
        expect(sentTypes).toEqual(["output_audio_buffer.clear", "conversation.item.create"]);

        void loop.handleEvent({ type: "session.updated" });
        sentTypes = send.mock.calls.map((c) => (c[0] as { type: string }).type);
        expect(sentTypes).toEqual([
            "output_audio_buffer.clear",
            "conversation.item.create",
            "response.create",
        ]);
    });

    it("handles missing tool handlers and malformed function-call arguments", async () => {
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
