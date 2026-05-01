import { vi } from 'vitest';
import { MeetingManager } from '@logic/MeetingManager.js';
import { setupTestOptions } from './testUtils.js';
import { DEFAULT_TEST_CHARACTERS, MockFactory } from './factories/MockFactory.ts';

import { getTestMode, TEST_MODES } from './testUtils.js';
import { getOpenAI } from '@services/OpenAIService.js';
import { meetingsCollection as dbMeetingsCollection, audioCollection as dbAudioCollection, insertMeeting as dbInsertMeeting } from '@services/DbService.js';

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

const createMockConversationService = (getOpenAIClient) => ({
    createChatCompletion: async ({
        messages,
        model,
        maxCompletionTokens,
        temperature,
        reasoning,
        stop
    }) => {
        const request = {
            messages,
            model,
            max_completion_tokens: maxCompletionTokens,
            temperature,
            stop,
        };
        if (reasoning && reasoning !== 'none') {
            request.reasoning_effort = reasoning;
        }
        const completion = await getOpenAIClient().chat.completions.create(request);

        return {
            id: completion.id ?? null,
            content: completion.choices?.[0]?.message?.content ?? null,
            finishReason: completion.choices?.[0]?.finish_reason ?? 'stop',
        };
    }
});

const createMockCollections = () => ({
    meetingsCollection: {
        findOne: vi.fn(),
        updateOne: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
        insertOne: vi.fn(),
        deleteMany: vi.fn(),
    },
    audioCollection: {
        findOne: vi.fn(),
        updateOne: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
        insertOne: vi.fn(),
        deleteMany: vi.fn(),
    },
    insertMeeting: vi.fn().mockResolvedValue({ insertedId: 1 }),
});

export const setupTestDependencies = () => {
    const mode = getTestMode();
    const fallbackCollections = createMockCollections();
    const collectionServices = {
        meetingsCollection: dbMeetingsCollection || fallbackCollections.meetingsCollection,
        audioCollection: dbAudioCollection || fallbackCollections.audioCollection,
        insertMeeting: dbInsertMeeting || fallbackCollections.insertMeeting,
    };
    if (mode === TEST_MODES.MOCK) {
        return {
            ...collectionServices,
            getOpenAI: () => mockOpenAI
        };
    } else {
        // FAST or FULL mode: Use real service
        return {
            ...collectionServices,
            getOpenAI: getOpenAI
        };
    }
};

export const createTestManager = (env = 'test', optionsOverride = null, services = {}) => {
    const mockSocket = {
        id: 'test-manager-socket',
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

    const baseOptions = optionsOverride || setupTestOptions();

    // Merge defaults with provided services
    const defaultServices = setupTestDependencies();
    const finalServices = { ...defaultServices, ...services };
    const manager = new MeetingManager(mockSocket, env, baseOptions, finalServices);
    if (!finalServices.conversationService) {
        manager.services.conversationService = createMockConversationService(() => manager.services.getOpenAI());
    }

    const meeting = MockFactory.createStoredMeeting({
        characters: DEFAULT_TEST_CHARACTERS.map((character) => MockFactory.createCharacter(character)),
        state: { humanName: 'Frank', alreadyInvited: false },
        conversation: []
    });

    manager.meeting = meeting;

    return { manager, mockSocket };
};

export const TestFactory = {
    createConversation: (length, lastSpeakerId = null, type = 'message') => {
        // Use MockFactory but adapt to match old TestFactory behavior (Modulo speakers)
        const speakers = DEFAULT_TEST_CHARACTERS.slice(0, 2).map((character) => character.id);
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
