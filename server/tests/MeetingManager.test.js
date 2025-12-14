import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MeetingManager } from '../src/logic/MeetingManager.js';
import { setupTestOptions } from './testUtils.js';

// Mock dependencies
vi.mock('../src/services/OpenAIService.js', () => ({
    getOpenAI: vi.fn(),
}));

describe('MeetingManager', () => {
    let manager;
    let mockSocket;

    beforeEach(() => {
        mockSocket = {
            on: vi.fn(),
            emit: vi.fn(),
        };
        const options = setupTestOptions();
        manager = new MeetingManager(mockSocket, 'test', options);

        // Setup realistic character state for testing
        manager.conversationOptions.characters = [
            { id: 'water', name: 'Water', type: 'food' }, // Chair
            { id: 'tomato', name: 'Tomato', type: 'food' },
            { id: 'potato', name: 'Potato', type: 'food' }
        ];
        // Ensure options point to Water as chair
        manager.conversationOptions.options = { ...manager.conversationOptions.options, chairId: 'water' };

        // Use a specific name for the human to distinguish from the "human" type
        manager.conversationOptions.state = { humanName: 'Frank' };
    });

    describe('Speaker Selection (calculateCurrentSpeaker)', () => {

        it('should start with the first speaker if conversation is empty', () => {
            manager.conversation = [];
            expect(manager.calculateCurrentSpeaker()).toBe(0); // Water
        });

        it('should rotate to the next speaker', () => {
            manager.conversation = [
                { speaker: 'water', type: 'message' }
            ];
            expect(manager.calculateCurrentSpeaker()).toBe(1); // Tomato
        });

        it('should loop back to the first speaker from the last', () => {
            manager.conversation = [
                { speaker: 'potato', type: 'message' }
            ];
            expect(manager.calculateCurrentSpeaker()).toBe(0); // Water
        });

        it('should skip invitations when calculating next speaker', () => {
            manager.conversation = [
                { speaker: 'water', type: 'message' },
                { speaker: 'water', type: 'invitation' } // Chair/System message
            ];
            // Should still think Water was the last real speaker, so next is Tomato
            expect(manager.calculateCurrentSpeaker()).toBe(1);
        });

        it('should answer direct questions from human', () => {
            manager.conversation = [
                { speaker: 'water', type: 'message' },
                // Frank (the human) asks Potato directly
                { speaker: 'Frank', type: 'human', askParticular: 'Potato' }
            ];
            expect(manager.calculateCurrentSpeaker()).toBe(2); // Potato
        });

        it('should return to natural order after a direct response', () => {
            // Water (0) spoke. Next should be Tomato (1).
            // Frank asks Potato (2).
            // Potato (2) answers.
            // Next should be Tomato (1).

            manager.conversation = [
                { speaker: 'water', type: 'message' },         // Index 0
                { speaker: 'Frank', type: 'human', askParticular: 'Potato' }, // Index 1
                { speaker: 'potato', type: 'response' }        // Index 2 (Response to human)
            ];

            expect(manager.calculateCurrentSpeaker()).toBe(1); // Tomato
        });

        it('should continue normally if the "response" was actually the correct turn anyway', () => {
            // Water (0) spoke. Next should be Tomato (1).
            // Frank asks Tomato (1).
            // Tomato (1) answers.
            // Next should be Potato (2).

            manager.conversation = [
                { speaker: 'water', type: 'message' },
                { speaker: 'Frank', type: 'human', askParticular: 'Tomato' },
                { speaker: 'tomato', type: 'response' }
            ];

            expect(manager.calculateCurrentSpeaker()).toBe(2); // Potato
        });

        it('should ignore human input if it is not a direct question', () => {
            manager.conversation = [
                { speaker: 'water', type: 'message' },
                { speaker: 'Frank', type: 'human' } // Generic comment
            ];
            expect(manager.calculateCurrentSpeaker()).toBe(1); // Tomato
        });

        it('should handle skipped messages by moving to the next speaker', () => {
            manager.conversation = [
                { speaker: 'water', type: 'message' },
                { speaker: 'tomato', type: 'skipped' }
            ];
            // Tomato was skipped, so Potato should be next
            expect(manager.calculateCurrentSpeaker()).toBe(2); // Potato
        });

        // --- Panelist Tests ---
        describe('Panelist Logic', () => {
            beforeEach(() => {
                // Add a human panelist "Alice" between Tomato and Potato
                manager.conversationOptions.characters = [
                    { id: 'water', name: 'Water', type: 'food' },
                    { id: 'tomato', name: 'Tomato', type: 'food' },
                    { id: 'alice', name: 'Alice', type: 'panelist' },
                    { id: 'potato', name: 'Potato', type: 'food' }
                ];
            });

            it('should treat panelists as normal speakers in rotation', () => {
                manager.conversation = [
                    { speaker: 'tomato', type: 'message' }
                ];
                // After Tomato (1), should be Alice (2)
                expect(manager.calculateCurrentSpeaker()).toBe(2);
            });

            it('should move from panelist to next food', () => {
                manager.conversation = [
                    { speaker: 'alice', type: 'message' }
                ];
                // After Alice (2), should be Potato (3)
                expect(manager.calculateCurrentSpeaker()).toBe(3);
            });
        });

        // --- Complex Interaction Tests ---
        describe('Complex Interactions', () => {
            beforeEach(() => {
                // Setup mixed council
                manager.conversationOptions.characters = [
                    { id: 'water', name: 'Water', type: 'food' },     // 0
                    { id: 'tomato', name: 'Tomato', type: 'food' },   // 1
                    { id: 'alice', name: 'Alice', type: 'panelist' }, // 2
                    { id: 'potato', name: 'Potato', type: 'food' }    // 3
                ];
            });

            it('should handle Hand Raise (Frank) during Panelist turn', () => {
                // Tomato spoke. Next should be Alice.
                // Frank interrupts with generic comment.
                manager.conversation = [
                    { speaker: 'tomato', type: 'message' },
                    { speaker: 'Frank', type: 'human' }
                ];
                // Frank is ignored (logic skips human without askParticular).
                // Last speaker was Tomato. Next is Alice.
                expect(manager.calculateCurrentSpeaker()).toBe(2); // Alice
            });


            it('should return to order after Food responds to Hand Raise (Interrupting Panelist)', () => {
                // Tomato (1) spoke. Next natural is Alice (2).
                // Frank asks Potato (3).
                // Potato (3) responds.
                // Logic should see Potato was out of turn.
                // Should skip Potato.
                // Should find Tomato.
                // Should return Alice (2).

                manager.conversation = [
                    { speaker: 'tomato', type: 'message' },
                    { speaker: 'Frank', type: 'human', askParticular: 'Potato' },
                    { speaker: 'potato', type: 'response' }
                ];

                expect(manager.calculateCurrentSpeaker()).toBe(2); // Alice
            });

            it('should handle multiple panelists and hand raises mingled', () => {
                // Characters: Water(0), Tomato(1), Alice(2), Bob(3), Potato(4)
                manager.conversationOptions.characters = [
                    { id: 'water', name: 'Water', type: 'food' },
                    { id: 'tomato', name: 'Tomato', type: 'food' },
                    { id: 'alice', name: 'Alice', type: 'panelist' },
                    { id: 'bob', name: 'Bob', type: 'panelist' },
                    { id: 'potato', name: 'Potato', type: 'food' }
                ];

                // Alice (2) spoke. Next natural is Bob (3).
                // Frank asks Water (0).
                // Water (0) responds.
                // Should resume to Bob (3).

                manager.conversation = [
                    { speaker: 'alice', type: 'message' },
                    { speaker: 'Frank', type: 'human', askParticular: 'Water' },
                    { speaker: 'water', type: 'response' }
                ];
                expect(manager.calculateCurrentSpeaker()).toBe(3); // Bob
            });
        });

    });
});
