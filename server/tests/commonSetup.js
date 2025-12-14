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

export const createTestManager = () => {
    const mockSocket = {
        on: vi.fn(),
        emit: vi.fn(),
    };
    const options = setupTestOptions();
    const manager = new MeetingManager(mockSocket, 'test', options);

    // Common setup
    manager.conversationOptions.characters = [
        { id: 'water', name: 'Water', type: 'food' }, // Chair
        { id: 'tomato', name: 'Tomato', type: 'food' },
        { id: 'potato', name: 'Potato', type: 'food' }
    ];
    manager.conversationOptions.options = { ...options, chairId: 'water' };
    manager.conversationOptions.language = 'en';
    manager.conversationOptions.state = { humanName: 'Frank' };

    return { manager, mockSocket };
};
