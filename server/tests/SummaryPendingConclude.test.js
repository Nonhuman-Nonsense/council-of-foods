import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTestManager } from './commonSetup.js';
import { stripAwaitingHumanTail, buildResumeConversation, buildReplayMeetingManifest } from '@api/replayManifest.js';
import { promoteMeetingCompleteIfReady } from '@logic/MeetingLifecycleHandler.js';
import { MockFactory } from './factories/MockFactory.ts';

/**
 * Covers the durable `summary_pending` conclude marker: the chair's closing line and the marker
 * are pushed atomically, the run loop turns the marker into the real summary, and a disconnect
 * anywhere in the conclude recovers by regenerating the summary (no duplicate closing line).
 */
describe('summary_pending conclude marker', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const fill = (n) =>
        Array.from({ length: n }, (_, i) => ({ type: 'message', speaker: 's', text: `m${i}` }));

    const mockClosing = (manager) =>
        vi.spyOn(manager.dialogGenerator, 'chairInterjection').mockResolvedValue({
            response: 'Closing', id: 'close1', sentences: ['Closing'], trimmed: false, pretrimmed: false,
        });
    const mockSummary = (manager) =>
        vi.spyOn(manager.dialogGenerator, 'generateDocument').mockResolvedValue({
            response: 'Summary', id: 'sum1', trimmed: false,
        });

    it('pushes the closing line + summary_pending atomically and does NOT generate the summary', async () => {
        const { manager } = createTestManager('test');
        manager.meeting.conversation = [{ id: '1', type: 'message', speaker: 's', text: 'hi' }];
        const closing = mockClosing(manager);
        const summary = mockSummary(manager);
        vi.spyOn(manager.services.meetingsCollection, 'updateOne').mockResolvedValue({});
        vi.spyOn(manager.audioSystem, 'generateAudio').mockResolvedValue(undefined);
        const startLoop = vi.spyOn(manager, 'startLoop').mockImplementation(() => {});

        await manager.meetingLifecycleHandler.handleConcludeMeeting({ date: '2025-01-01' });

        expect(manager.meeting.conversation.map((m) => m.type)).toEqual(['message', 'message', 'summary_pending']);
        expect(closing).toHaveBeenCalledTimes(1);
        expect(summary).not.toHaveBeenCalled();     // summary is the loop's job, not conclude's
        expect(startLoop).toHaveBeenCalled();        // conclude kicks the loop to pick up the marker
    });

    it('end-to-end: the loop turns the marker into exactly one closing + one summary', async () => {
        const { manager } = createTestManager('test');
        manager.serverOptions.conversationMaxLength = 5;
        manager.serverOptions.meetingVeryMaxLength = 5; // no room to extend => auto-conclude
        manager.meeting.conversationExtraSlots = 0;
        manager.meeting.conversation = fill(5);
        const closing = mockClosing(manager);
        const summary = mockSummary(manager);
        vi.spyOn(manager.services.meetingsCollection, 'updateOne').mockResolvedValue({});
        vi.spyOn(manager.services.meetingsCollection, 'findOne').mockResolvedValue(null);
        vi.spyOn(manager.audioSystem, 'generateAudio').mockResolvedValue(undefined);

        await manager.runLoop();

        expect(closing).toHaveBeenCalledTimes(1);
        expect(summary).toHaveBeenCalledTimes(1);
        expect(manager.meeting.conversation.slice(-2).map((m) => m.type)).toEqual(['message', 'summary']);
        expect(manager.meeting.conversation.filter((m) => m.type === 'summary')).toHaveLength(1);
        expect(manager.meeting.conversation.some((m) => m.type === 'summary_pending')).toBe(false);
    });

    it('recovers a mid-conclude disconnect: regenerates the summary with NO duplicate closing', async () => {
        const { manager } = createTestManager('test');
        manager.serverOptions.conversationMaxLength = 100;
        manager.serverOptions.meetingVeryMaxLength = 100;
        // Persisted state after a disconnect: closing already written, marker still pending.
        manager.meeting.conversation = [
            ...fill(3),
            { id: 'close1', type: 'message', speaker: 'chair', text: 'Closing' },
            { type: 'summary_pending' },
        ];
        const closing = mockClosing(manager);
        const summary = mockSummary(manager);
        vi.spyOn(manager.services.meetingsCollection, 'updateOne').mockResolvedValue({});
        vi.spyOn(manager.services.meetingsCollection, 'findOne').mockResolvedValue(null);
        vi.spyOn(manager.audioSystem, 'generateAudio').mockResolvedValue(undefined);

        await manager.runLoop();

        expect(closing).not.toHaveBeenCalled();  // the conclusion is NOT re-run → no duplicate closing
        expect(summary).toHaveBeenCalledTimes(1);
        expect(manager.meeting.conversation.map((m) => m.type)).toEqual([
            'message', 'message', 'message', 'message', 'summary',
        ]);
    });

    it('decideNextAction returns GENERATE_SUMMARY for a summary_pending tail even when interrupted', () => {
        const { manager } = createTestManager('test');
        manager.meeting.conversation = [...fill(2), { type: 'summary_pending' }];

        // A stale raised hand / pause (e.g. carried in on reconnect) must never stall the conclusion.
        manager.handRaised = true;
        manager.isPaused = true;

        expect(manager.decideNextAction().type).toBe('GENERATE_SUMMARY');
    });

    it('server rejects raise_hand once concluding — conversation is not truncated', async () => {
        const { manager } = createTestManager('test');
        manager.meeting.conversation = [
            ...fill(2),
            { id: 'close1', type: 'message', speaker: 'chair', text: 'Closing' },
            { type: 'summary_pending' },
        ];
        const before = [...manager.meeting.conversation];
        const chair = vi.spyOn(manager.dialogGenerator, 'chairInterjection');

        await manager.handRaisingHandler.handleRaiseHand({ index: 1, humanName: 'Frank' });

        expect(manager.handRaised).toBe(false);          // not set
        expect(manager.meeting.conversation).toEqual(before); // slice() never ran
        expect(chair).not.toHaveBeenCalled();            // no invitation generated
    });

    it('resume KEEPS the summary_pending marker so the resumed live loop finishes the summary', () => {
        // stripAwaitingHumanTail must NOT strip it: buildResumeConversation persists straight back
        // to the DB, so dropping the marker would lose the summary on resume.
        const tail = [
            { id: 'm0', type: 'message', speaker: 's', text: 'hi' },
            { id: 'close1', type: 'message', speaker: 'chair', text: 'Closing' },
            { type: 'summary_pending' },
        ];
        stripAwaitingHumanTail(tail);
        expect(tail.map((m) => m.type)).toEqual(['message', 'message', 'summary_pending']);

        const meeting = MockFactory.createStoredMeeting({
            _id: 950,
            conversation: [
                { id: 'm0', type: 'message', speaker: 'water', text: 'hi' },
                { id: 'close1', type: 'message', speaker: 'chair', text: 'Closing' },
                { type: 'summary_pending' },
            ],
            audio: ['m0', 'close1'],
            maximumPlayedIndex: 2,
        });
        expect(buildResumeConversation(meeting).map((m) => m.type)).toEqual(['message', 'message', 'summary_pending']);
    });

    it('replay STRIPS the summary_pending marker and shows meeting_incomplete', () => {
        // Read-only replay has no live server to generate the summary, so a mid-conclude meeting
        // must present as incomplete rather than a placeholder that never resolves.
        const meeting = MockFactory.createStoredMeeting({
            _id: 951,
            conversation: [
                { id: 'm0', type: 'message', speaker: 'water', text: 'hi' },
                { id: 'close1', type: 'message', speaker: 'chair', text: 'Closing' },
                { type: 'summary_pending' },
            ],
            audio: ['m0', 'close1'],
            maximumPlayedIndex: 2,
        });
        const manifest = buildReplayMeetingManifest(meeting);
        expect(manifest.conversation.map((m) => m.type)).toEqual(['message', 'message', 'meeting_incomplete']);
    });
});

describe('promoteMeetingCompleteIfReady', () => {
    const buildCtx = (storedMeeting, meetingComplete = false) => {
        const findOne = vi.fn().mockResolvedValue(storedMeeting);
        const updateOne = vi.fn().mockResolvedValue({});
        const meeting = { _id: storedMeeting._id, meetingComplete };
        return {
            ctx: {
                meeting,
                environment: 'test',
                services: { meetingsCollection: { findOne, updateOne } },
                getReportContext: () => ({ meetingId: storedMeeting._id }),
            },
            findOne,
            updateOne,
            meeting,
        };
    };

    it('promotes when the replay manifest is complete (summary at tail with its audio)', async () => {
        const stored = MockFactory.createStoredMeeting({
            _id: 900,
            conversation: [
                { id: 'm0', type: 'message', speaker: 'water', text: 'hi' },
                { id: 'sum1', type: 'summary', speaker: 'chair', text: 'Summary', sentences: [] },
            ],
            audio: ['m0', 'sum1'],
            maximumPlayedIndex: 1,
            meetingComplete: false,
        });
        const { ctx, updateOne, meeting } = buildCtx(stored);

        await promoteMeetingCompleteIfReady(ctx);

        expect(updateOne).toHaveBeenCalledWith({ _id: 900 }, { $set: { meetingComplete: true } });
        expect(meeting.meetingComplete).toBe(true);
    });

    it('leaves meetingComplete false when the summary audio is missing', async () => {
        const stored = MockFactory.createStoredMeeting({
            _id: 901,
            conversation: [
                { id: 'm0', type: 'message', speaker: 'water', text: 'hi' },
                { id: 'sum1', type: 'summary', speaker: 'chair', text: 'Summary', sentences: [] },
            ],
            audio: ['m0'], // summary audio not yet persisted
            maximumPlayedIndex: 1,
            meetingComplete: false,
        });
        const { ctx, updateOne, meeting } = buildCtx(stored);

        await promoteMeetingCompleteIfReady(ctx);

        expect(updateOne).not.toHaveBeenCalled();
        expect(meeting.meetingComplete).toBe(false);
    });
});
