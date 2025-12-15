import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingManager } from '@logic/MeetingManager.js';
import { setupTestOptions } from './testUtils.js';
import { meetingsCollection } from '@services/DbService.js';

import { getTestMode, TEST_MODES } from './testUtils.js';
import { getOpenAI } from '@services/OpenAIService.js';

// Reusable mock setup
export const mockOpenAI = {
    chat: {
        completions: {
            create: vi.fn().mockResolvedValue({
                choices: [{ message: { content: 'Invitation text' } }]
            })
        }
    },
    audio: {
        speech: {
            create: vi.fn().mockResolvedValue({
                arrayBuffer: async () => new ArrayBuffer(8)
            })
        },
        transcriptions: {
            create: vi.fn().mockResolvedValue({
                words: []
            })
        }
    }
};

export const setupTestDependencies = () => {
    const mode = getTestMode();
    if (mode === TEST_MODES.MOCK) {
        return {
            getOpenAI: () => mockOpenAI
        };
    } else {
        // FAST or FULL mode: Use real service
        return {
            getOpenAI: getOpenAI
        };
    }
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

    // Merge defaults with provided services
    const defaultServices = setupTestDependencies();
    const finalServices = { ...defaultServices, ...services };

    const manager = new MeetingManager(mockSocket, env, options, finalServices);

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
