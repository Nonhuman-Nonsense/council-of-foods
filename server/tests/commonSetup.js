import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingManager } from '../src/logic/MeetingManager.js';
import { setupTestOptions } from './testUtils.js';
import { meetingsCollection } from '../src/services/DbService.js';

// Reusable mock setup
export const mockOpenAI = {
    chat: {
        completions: {
            create: vi.fn().mockResolvedValue({
                choices: [{ message: { content: 'Invitation text' } }]
            })
        }
    },
    audio: { speech: { create: vi.fn() } }
};

export const createTestManager = (env = 'test', optionsOverride = null, services = {}) => {
    const mockSocket = {
        on: vi.fn(),
        emit: vi.fn(),
        handlers: {},
        trigger: function (event, ...args) {
            if (this.handlers[event]) {
                this.handlers[event](...args);
            }
        }
    };
    mockSocket.on.mockImplementation((event, callback) => {
        mockSocket.handlers[event] = callback;
    });
    const options = optionsOverride || setupTestOptions();
    const manager = new MeetingManager(mockSocket, env, options, services);

    // Common setup
    manager.conversationOptions.characters = [
        { id: 'water', name: 'Water', type: 'food' }, // Chair
        { id: 'tomato', name: 'Tomato', type: 'food' },
        { id: 'potato', name: 'Potato', type: 'food' }
    ];
    manager.conversationOptions.options = {
        ...options,
        chairId: 'water'
    };
    manager.conversationOptions.language = 'en';
    manager.conversationOptions.state = { humanName: 'Frank' };

    return { manager, mockSocket };
};

export const TestFactory = {
    createConversation: (length, lastSpeakerId = null, type = 'message') => {
        const conv = [];
        for (let i = 0; i < length; i++) {
            conv.push({
                id: `msg_${i}`,
                type: type,
                text: `Message ${i}`,
                speaker: lastSpeakerId ? lastSpeakerId : (i % 2 === 0 ? 'water' : 'tomato')
            });
        }
        return conv;
    },
    createAwaitingPanelist: (speakerId) => {
        return [{ type: 'awaiting_human_panelist', speaker: speakerId }];
    },
    createAwaitingQuestion: (humanName = 'Frank') => {
        return [{ type: 'awaiting_human_question', speaker: humanName }];
    }
};
