import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingManager } from '@logic/MeetingManager.js';
import { setupTestOptions } from './testUtils.js';
import { meetingsCollection } from '@services/DbService.js';
import { MockFactory } from './factories/MockFactory.ts';

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

    // Use MockFactory for options
    const baseOptions = optionsOverride || setupTestOptions();

    // Merge defaults with provided services
    const defaultServices = setupTestDependencies();
    const finalServices = { ...defaultServices, ...services };

    // Create Manager
    const manager = new MeetingManager(mockSocket, env, baseOptions, finalServices);

    // Initialize with Mock Data
    manager.conversationOptions = MockFactory.createConversationOptions({
        ...baseOptions,
        characters: [
            MockFactory.createCharacter({ id: 'water', name: 'Water' }),
            MockFactory.createCharacter({ id: 'tomato', name: 'Tomato' }),
            MockFactory.createCharacter({ id: 'potato', name: 'Potato' })
        ],
        state: { humanName: 'Frank' },
        options: {
            ...MockFactory.createConversationOptions().options,
            chairId: 'water',
            ...baseOptions
        }
    });

    // Ensure language is set if it was missing in baseOptions
    if (!manager.conversationOptions.language) {
        manager.conversationOptions.language = 'en';
    }

    return { manager, mockSocket };
};

export const TestFactory = {
    createConversation: (length, lastSpeakerId = null, type = 'message') => {
        // Use MockFactory but adapt to match old TestFactory behavior (Modulo speakers)
        const speakers = ['water', 'tomato'];
        const conv = Array.from({ length }, (_, i) => MockFactory.createMessage({
            id: `msg_${i}`,
            type: type,
            text: `Message ${i}`,
            speaker: lastSpeakerId ? lastSpeakerId : speakers[i % 2]
        }));
        return conv;
    },
    createAwaitingPanelist: (speakerId) => {
        return [MockFactory.createMessage({ type: 'awaiting_human_panelist', speaker: speakerId })];
    },
    createAwaitingQuestion: (humanName = 'Frank') => {
        return [MockFactory.createMessage({ type: 'awaiting_human_question', speaker: humanName })];
    }
};
