import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestManager } from './commonSetup.js';
import { SpeakerSelector } from '@logic/SpeakerSelector.js';
import { Logger } from '@utils/Logger.js';
import { ABSOLUTE_MAX_CONVERSATION_LENGTH } from '@logic/MeetingManager.js';

/**
 * Regression coverage for the run-loop hardening (see MeetingManager.runLoop / startLoop).
 *
 * Background: a single overloaded `isLoopActive` boolean used to be flipped false BEFORE the
 * terminal processTurn ran, so any of the several unconditional startLoop() callers
 * (report_maximum_played_index, reconnect, extend) could race into that window and spawn a
 * second concurrent loop. With no conclude mutex, that produced dozens of concurrent concludes
 * — each doing a full LLM + TTS round trip — which blew past the TTS provider's concurrency cap.
 *
 * The fix splits the concern into `loopRunning` (exactly one loop), `wakeRequested` (never lose
 * a wake) and `isActive` (session liveness), plus an absolute circuit breaker.
 */
describe('MeetingManager run-loop hardening', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const fillConversation = (n) =>
        Array.from({ length: n }, (_, i) => ({ type: 'message', speaker: 's', text: `m${i}` }));

    const deferred = () => {
        let resolve;
        const promise = new Promise((res) => { resolve = res; });
        return { promise, resolve };
    };

    it('concludes exactly once even under a storm of concurrent startLoop() calls', async () => {
        const { manager } = createTestManager('test');
        manager.serverOptions.conversationMaxLength = 5;
        manager.serverOptions.meetingVeryMaxLength = 5; // no room to extend => CONCLUDE, not QUERY_EXTENSION
        manager.meeting.conversationExtraSlots = 0;
        manager.meeting.conversation = fillConversation(5);

        vi.spyOn(manager.services.meetingsCollection, 'updateOne').mockResolvedValue({});
        vi.spyOn(manager.services.meetingsCollection, 'findOne').mockResolvedValue(null);
        vi.spyOn(manager.audioSystem, 'generateAudio').mockResolvedValue(undefined);

        // Hold the closing line open so we can hammer startLoop() while the conclude is in flight.
        const closingGate = deferred();
        vi.spyOn(manager.dialogGenerator, 'chairInterjection').mockImplementation(async () => {
            await closingGate.promise;
            return { response: 'Closing', id: 'close1', sentences: ['Closing'], trimmed: false, pretrimmed: false };
        });
        vi.spyOn(manager.dialogGenerator, 'generateDocument').mockResolvedValue({
            response: 'Summary', id: 'sum1', trimmed: false,
        });

        const concludeSpy = vi.spyOn(manager.meetingLifecycleHandler, 'handleConcludeMeeting');

        const loopDone = manager.runLoop();

        // Conclude has started and is parked on the closing line.
        await vi.waitFor(() => expect(concludeSpy).toHaveBeenCalledTimes(1));

        // Simulate the flood of unconditional wakes that used to spawn duplicate loops.
        for (let i = 0; i < 25; i++) manager.startLoop();
        expect(manager.loopRunning).toBe(true);   // still exactly one loop
        expect(manager.wakeRequested).toBe(true);  // wakes were latched, not lost

        closingGate.resolve();
        await loopDone;

        // Exactly one conclude, one closing line, one summary — no runaway.
        expect(concludeSpy).toHaveBeenCalledTimes(1);
        expect(manager.dialogGenerator.generateDocument).toHaveBeenCalledTimes(1);
        expect(manager.meeting.conversation.filter((m) => m.type === 'summary')).toHaveLength(1);
        expect(manager.loopRunning).toBe(false);
        expect(manager.meeting.conversation.length).toBeLessThanOrEqual(
            manager.serverOptions.meetingVeryMaxLength + 5
        );
    });

    it('does not drop a wake that arrives while a terminal turn is in flight', async () => {
        const { manager } = createTestManager('test');
        // Soft cap reached but with head-room => QUERY_EXTENSION (a terminal action).
        manager.serverOptions.conversationMaxLength = 5;
        manager.serverOptions.meetingVeryMaxLength = 100;
        manager.meeting.conversationExtraSlots = 0;
        manager.meeting.conversation = fillConversation(5);

        vi.spyOn(SpeakerSelector, 'calculateNextSpeaker').mockReturnValue(1);
        vi.spyOn(manager.dialogGenerator, 'generateResponseWithRetry').mockResolvedValue({
            response: 'Extended turn', id: 'ext', sentences: ['Extended turn'], trimmed: false, pretrimmed: false,
        });
        vi.spyOn(manager.audioSystem, 'queueAudioGeneration').mockImplementation(() => {});

        // Hold the QUERY_EXTENSION DB write open so we can inject a wake mid-terminal-turn.
        const writeGate = deferred();
        let firstWrite = true;
        vi.spyOn(manager.services.meetingsCollection, 'updateOne').mockImplementation(async () => {
            if (firstWrite) { firstWrite = false; await writeGate.promise; }
            return {};
        });

        const loopDone = manager.runLoop();

        // The query_extension sentinel is pushed and the loop is parked on the DB write.
        await vi.waitFor(() => expect(manager.meeting.conversation.at(-1)?.type).toBe('query_extension'));
        expect(manager.loopRunning).toBe(true);

        // "Extend" while the terminal turn is still in flight: strip the sentinel, raise the cap,
        // and wake the loop. A dropped wake would strand the meeting here forever.
        manager.meeting.conversation.pop();
        manager.meeting.conversationExtraSlots = 5;
        manager.startLoop();

        writeGate.resolve();
        await loopDone;

        // The latch re-entered the loop and generated further turns instead of exiting.
        expect(manager.meeting.conversation.some((m) => m.text === 'Extended turn')).toBe(true);
        expect(manager.loopRunning).toBe(false);
    });

    it('resumes generation on playback progress without losing the wake (report_maximum_played_index path)', async () => {
        const { manager } = createTestManager('test'); // non-prototype => playback-ahead buffer applies
        manager.serverOptions.conversationMaxLength = 100;
        manager.serverOptions.meetingVeryMaxLength = 100;
        manager.meeting.conversation = [];
        manager.meeting.maximumPlayedIndex = 0;

        vi.spyOn(SpeakerSelector, 'calculateNextSpeaker').mockReturnValue(1);
        vi.spyOn(manager.dialogGenerator, 'generateResponseWithRetry').mockResolvedValue({
            response: 'Hi', id: 'x', sentences: ['Hi'], trimmed: false, pretrimmed: false,
        });
        vi.spyOn(manager.audioSystem, 'queueAudioGeneration').mockImplementation(() => {});
        vi.spyOn(manager.services.meetingsCollection, 'updateOne').mockResolvedValue({});

        // Generates up to maximumPlayedIndex + PLAYBACK_AHEAD_BUFFER (0 + 3), then IDLEs at length 4.
        await manager.runLoop();
        expect(manager.meeting.conversation.length).toBe(4);
        expect(manager.loopRunning).toBe(false);

        // Client reports it played further; the wake must resume generation to the new edge.
        manager.meeting.maximumPlayedIndex = 3;
        manager.startLoop();
        await vi.waitFor(() => expect(manager.meeting.conversation.length).toBe(7));
        expect(manager.loopRunning).toBe(false);
    });

    it('hard-stops and reports when the conversation blows past the runaway ceiling', async () => {
        const { manager } = createTestManager('test');
        // The ceiling is a fixed constant, deliberately independent of
        // serverOptions.meetingVeryMaxLength — even a generous/misconfigured meetingVeryMaxLength
        // cannot raise it. A wildly generous meetingVeryMaxLength here proves the breaker still
        // trips on the fixed ceiling, not on server config.
        manager.serverOptions.meetingVeryMaxLength = 1000;
        manager.meeting.conversation = fillConversation(ABSOLUTE_MAX_CONVERSATION_LENGTH + 1);

        const crashSpy = vi.spyOn(Logger, 'reportAndCrashClient').mockImplementation(() => {});
        const decideSpy = vi.spyOn(manager, 'decideNextAction');

        await manager.runLoop();

        expect(crashSpy).toHaveBeenCalledWith(
            'meeting',
            'Runaway conversation length; aborting loop',
            expect.anything()
        );
        expect(manager.isActive).toBe(false);       // session killed
        expect(manager.loopRunning).toBe(false);    // loop released
        expect(decideSpy).not.toHaveBeenCalled();   // breaker fires before any decision/generation
    });

    it('does NOT trip the breaker for a meeting legitimately reaching its configured hard cap', async () => {
        // Guards against accidentally re-deriving the ceiling from serverOptions again: a
        // meeting that reaches its own (real default) meetingVeryMaxLength and concludes must
        // not be mistaken for a runaway just because the fixed ceiling sits close to it.
        const { manager } = createTestManager('test');
        const hardCap = 30; // the real deployed default
        manager.serverOptions.conversationMaxLength = hardCap;
        manager.serverOptions.meetingVeryMaxLength = hardCap;
        manager.meeting.conversationExtraSlots = 0;
        // At the hard cap; conclude appends closing + summary_pending (32), well under the fixed
        // ceiling but only a few below it — this is the realistic worst case, not a loose margin.
        manager.meeting.conversation = fillConversation(hardCap);

        const crashSpy = vi.spyOn(Logger, 'reportAndCrashClient').mockImplementation(() => {});
        vi.spyOn(manager.services.meetingsCollection, 'updateOne').mockResolvedValue({});
        vi.spyOn(manager.services.meetingsCollection, 'findOne').mockResolvedValue(null);
        vi.spyOn(manager.dialogGenerator, 'chairInterjection').mockResolvedValue({
            response: 'Closing', id: 'close1', sentences: ['Closing'], trimmed: false, pretrimmed: false,
        });
        vi.spyOn(manager.dialogGenerator, 'generateDocument').mockResolvedValue({
            response: 'Summary', id: 'sum1', trimmed: false,
        });
        vi.spyOn(manager.audioSystem, 'generateAudio').mockResolvedValue(undefined);
        const decideSpy = vi.spyOn(manager, 'decideNextAction');

        await manager.runLoop();

        expect(crashSpy).not.toHaveBeenCalled();
        // Proceeded through a normal decision (hard cap → conclude → summary), not a hard-stop.
        expect(decideSpy).toHaveBeenCalled();
        expect(manager.meeting.conversation.some((m) => m.type === 'summary')).toBe(true);
    });

    it('routes the summary audio through the shared queue instead of bypassing it', async () => {
        const { manager } = createTestManager('test');
        manager.serverOptions.conversationMaxLength = 5;
        manager.serverOptions.meetingVeryMaxLength = 5;
        manager.meeting.conversationExtraSlots = 0;
        manager.meeting.conversation = fillConversation(5);

        vi.spyOn(manager.dialogGenerator, 'chairInterjection').mockResolvedValue({
            response: 'Closing', id: 'close1', sentences: ['Closing'], trimmed: false, pretrimmed: false,
        });
        vi.spyOn(manager.dialogGenerator, 'generateDocument').mockResolvedValue({
            response: 'Summary', id: 'sum1', trimmed: false,
        });
        vi.spyOn(manager.services.meetingsCollection, 'findOne').mockResolvedValue(null);
        vi.spyOn(manager.services.meetingsCollection, 'updateOne').mockResolvedValue({});

        const queueSpy = vi.spyOn(manager.audioSystem, 'queueAudioGeneration');
        // The queue task calls generateAudio internally; mock it so the queued task resolves.
        vi.spyOn(manager.audioSystem, 'generateAudio').mockResolvedValue(undefined);

        await manager.runLoop();

        // The summary is queued with skipMatching=true (6th arg), proving it flows through the
        // one concurrency-limited queue rather than the old direct generateAudio bypass.
        const summaryQueued = queueSpy.mock.calls.some(
            (call) => call[0]?.id === 'sum1' && call[5] === true
        );
        expect(summaryQueued).toBe(true);
    });
});
