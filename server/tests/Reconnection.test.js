
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MeetingManager } from '../src/logic/MeetingManager.js';
import { createTestManager, TestFactory, mockOpenAI } from './commonSetup.js';

describe('MeetingManager - Reconnection & Resilience', () => {
    let context;
    let manager;

    let services;

    beforeEach(async () => {
        // Mock Services
        services = {
            meetingsCollection: { findOne: vi.fn(), updateOne: vi.fn() },
            audioCollection: { findOne: vi.fn(), updateOne: vi.fn() },
            getOpenAI: vi.fn().mockReturnValue(mockOpenAI), // Correctly return the mock client
            insertMeeting: vi.fn()
        };
        // Setup Context
        const result = createTestManager('test', null, services);
        manager = result.manager;
        context = { ...result, services };

        // Mock Audio System specifically to spy on queue
        manager.audioSystem.queueAudioGeneration = vi.fn();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should restore conversation state from database on reconnection', async () => {
        // 1. Setup Initial State in DB
        const savedConversation = [
            { id: 'msg1', type: 'message', speaker: 'water', text: 'Hello', sentences: [['Hello']] },
            { id: 'msg2', type: 'message', speaker: 'potato', text: 'Hi', sentences: [['Hi']] }
        ];
        const savedOptions = { ...manager.conversationOptions, state: { alreadyInvited: true } };
        const savedMeetingId = "meeting_restoration_test";

        // Mock finding the meeting
        context.services.meetingsCollection.findOne.mockResolvedValue({
            _id: savedMeetingId,
            conversation: savedConversation,
            options: savedOptions,
            date: new Date().toISOString(),
            audio: ['msg1', 'msg2']
        });

        // 2. Simulate Reconnection
        const reconnectOptions = {
            meetingId: savedMeetingId,
            conversationMaxLength: 10,
            handRaised: false
        };

        // Spy on startLoop to verify resumption
        const startLoopSpy = vi.spyOn(manager, 'startLoop').mockImplementation(() => { });

        await manager.handleReconnection(reconnectOptions);

        // 3. Verify State Restoration
        expect(manager.meetingId).toBe(savedMeetingId);
        expect(manager.conversation).toEqual(savedConversation);
        expect(manager.conversationOptions).toEqual(savedOptions); // Basic check

        // 4. Verify Loop Resumption
        expect(startLoopSpy).toHaveBeenCalled();
        expect(context.mockSocket.emit).toHaveBeenCalledWith("conversation_update", savedConversation);
    });

    it('should queue audio generation for missing audio files', async () => {
        // Spy on startLoop to prevent actual loop execution during this test
        vi.spyOn(manager, 'startLoop').mockImplementation(() => { });

        // 1. Setup DB with missing audio
        const savedConversation = [
            { id: 'msg1', type: 'message', speaker: 'water', text: 'Has Audio', sentences: [] },
            { id: 'msg2', type: 'message', speaker: 'potato', text: 'Missing Audio', sentences: [] }
        ];

        context.services.meetingsCollection.findOne.mockResolvedValue({
            _id: "audio_recovery_test",
            conversation: savedConversation,
            options: manager.conversationOptions,
            date: new Date().toISOString(),
            audio: ['msg1'] // msg2 is missing
        });

        // Spy on audio queue
        const queueSpy = vi.spyOn(manager.audioSystem, 'queueAudioGeneration');

        // 2. Reconnect
        await manager.handleReconnection({ meetingId: "audio_recovery_test" });

        // 3. Verify msg2 was queued
        expect(queueSpy).toHaveBeenCalledTimes(1);
        expect(queueSpy).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'msg2' }),
            expect.anything(),
            expect.anything(),
            expect.anything(),
            expect.anything()
        );
    });

    // Failing test case we expect to fix
    it('should emit conversation_update immediately upon reconnection', async () => {
        vi.spyOn(manager, 'startLoop').mockImplementation(() => { }); // Prevent loop
        const savedConversation = [{ id: '1', text: 'recover me' }];
        context.services.meetingsCollection.findOne.mockResolvedValue({
            _id: "sync_test",
            conversation: savedConversation,
            options: manager.conversationOptions,
            date: new Date().toISOString(),
            audio: []
        });

        await manager.handleReconnection({ meetingId: "sync_test" });

        expect(context.mockSocket.emit).toHaveBeenCalledWith("conversation_update", savedConversation);
    });
});
