import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createTestManager, TestFactory } from './commonSetup.js';
import { clearLiveSessionRegistryForTests, tryAcquireLiveSession } from '@logic/liveSessionRegistry.js';

describe('MeetingManager conversation transitions', () => {
    beforeEach(() => {
        clearLiveSessionRegistryForTests();
    });

    it('defers loop restarts from playback progress while wrap_up_meeting is generating summary', async () => {
        let finishSummary;
        const { manager } = createTestManager('test');
        tryAcquireLiveSession(manager.meeting._id, manager.socket.id, manager.meeting.liveKey);
        manager.serverOptions.conversationMaxLength = 3;
        manager.serverOptions.concludeMeetingPrompt = { en: 'Closing' };
        manager.serverOptions.concludeMeetingLength = 10;
        manager.serverOptions.finalizeMeetingPrompt = { en: 'Summary [DATE]' };
        manager.serverOptions.finalizeMeetingLength = 10;
        manager.meeting.conversationExtraSlots = 0;
        manager.meeting.maximumPlayedIndex = 2;
        manager.meeting.conversation = [
            ...TestFactory.createConversation(3),
            { type: 'query_extension' },
        ];
        manager.dialogGenerator.chairInterjection = vi.fn()
            .mockResolvedValueOnce({ response: 'Closing line', id: 'close1' })
            .mockReturnValueOnce(new Promise((resolve) => {
                finishSummary = () => resolve({ response: 'Summary', id: 'sum1' });
            }));
        manager.audioSystem.generateAudio = vi.fn().mockResolvedValue();
        manager.audioSystem.queueAudioGeneration = vi.fn();
        const runLoop = vi.spyOn(manager, 'runLoop').mockImplementation(() => {});

        const wrapEvent = manager.handleEvent('wrap_up_meeting', { date: '2025-01-01' });

        await vi.waitFor(() => {
            expect(manager.meeting.conversation.map((message) => message.type)).toEqual([
                'message', 'message', 'message', 'message',
            ]);
        });

        const progressEvent = manager.handleEvent('report_maximum_played_index', { index: 2 });
        await progressEvent;

        expect(runLoop).not.toHaveBeenCalled();

        finishSummary();
        await wrapEvent;

        expect(manager.meeting.conversation.map((message) => message.type)).toEqual(['message', 'message', 'message', 'message', 'summary']);
        expect(runLoop).toHaveBeenCalledTimes(1);
    });

    it('defers loop restarts from playback progress until continue_conversation finishes', async () => {
        let finishContinuePersist;
        const continuePersist = new Promise((resolve) => {
            finishContinuePersist = () => resolve({ matchedCount: 1, modifiedCount: 1 });
        });
        const meetingsCollection = {
            findOne: vi.fn(),
            insertOne: vi.fn(),
            updateOne: vi.fn()
                .mockReturnValueOnce(continuePersist)
                .mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
        };
        const { manager } = createTestManager('test', null, { meetingsCollection });
        tryAcquireLiveSession(manager.meeting._id, manager.socket.id, manager.meeting.liveKey);
        manager.serverOptions.conversationMaxLength = 3;
        manager.serverOptions.extraMessageCount = 5;
        manager.meeting.conversationExtraSlots = 0;
        manager.meeting.maximumPlayedIndex = 2;
        manager.meeting.conversation = [
            ...TestFactory.createConversation(3),
            { type: 'query_extension' },
        ];
        const runLoop = vi.spyOn(manager, 'runLoop').mockImplementation(() => {});

        const continueEvent = manager.handleEvent('continue_conversation');
        await Promise.resolve();

        expect(manager.meeting.conversation.map((message) => message.type)).toEqual(['message', 'message', 'message']);

        const progressEvent = manager.handleEvent('report_maximum_played_index', { index: 2 });
        await progressEvent;

        expect(runLoop).not.toHaveBeenCalled();

        finishContinuePersist();
        await continueEvent;

        expect(runLoop).toHaveBeenCalledTimes(1);
    });
});
