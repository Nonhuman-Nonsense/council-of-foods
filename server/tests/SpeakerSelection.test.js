import { describe, it, expect, beforeEach } from 'vitest';
import { createTestManager } from './commonSetup.js';
import { SpeakerSelector } from '../src/logic/SpeakerSelector.js';

describe('MeetingManager - Speaker Selection', () => {
    let manager;

    beforeEach(() => {
        const setup = createTestManager();
        manager = setup.manager;
    });

    describe('calculateCurrentSpeaker', () => {
        it('should start with the first speaker if conversation is empty', () => {
            manager.conversation = [];
            expect(SpeakerSelector.calculateNextSpeaker(manager.conversation, manager.conversationOptions.characters)).toBe(0); // Water
        });

        it('should rotate to the next speaker', () => {
            manager.conversation = [
                { speaker: 'water', type: 'message' }
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.conversation, manager.conversationOptions.characters)).toBe(1); // Tomato
        });

        it('should loop back to the first speaker from the last', () => {
            manager.conversation = [
                { speaker: 'potato', type: 'message' }
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.conversation, manager.conversationOptions.characters)).toBe(0); // Water
        });

        it('should skip invitations when calculating next speaker', () => {
            manager.conversation = [
                { speaker: 'water', type: 'message' },
                { speaker: 'water', type: 'invitation' } // Chair/System message
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.conversation, manager.conversationOptions.characters)).toBe(1);
        });

        it('should answer direct questions from human', () => {
            manager.conversation = [
                { speaker: 'water', type: 'message' },
                // Frank (the human) asks Potato directly
                { speaker: 'Frank', type: 'human', askParticular: 'Potato' }
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.conversation, manager.conversationOptions.characters)).toBe(2); // Potato
        });

        it('should return to natural order after a direct response', () => {
            manager.conversation = [
                { speaker: 'water', type: 'message' },         // Index 0
                { speaker: 'Frank', type: 'human', askParticular: 'Potato' }, // Index 1
                { speaker: 'potato', type: 'response' }        // Index 2 (Response to human)
            ];

            expect(SpeakerSelector.calculateNextSpeaker(manager.conversation, manager.conversationOptions.characters)).toBe(1); // Tomato
        });

        it('should continue normally if the "response" was actually the correct turn anyway', () => {
            manager.conversation = [
                { speaker: 'water', type: 'message' },
                { speaker: 'Frank', type: 'human', askParticular: 'Tomato' },
                { speaker: 'tomato', type: 'response' }
            ];

            expect(SpeakerSelector.calculateNextSpeaker(manager.conversation, manager.conversationOptions.characters)).toBe(2); // Potato
        });

        it('should ignore human input if it is not a direct question', () => {
            manager.conversation = [
                { speaker: 'water', type: 'message' },
                { speaker: 'Frank', type: 'human' } // Generic comment
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.conversation, manager.conversationOptions.characters)).toBe(1); // Tomato
        });

        it('should handle skipped messages by moving to the next speaker', () => {
            manager.conversation = [
                { speaker: 'water', type: 'message' },
                { speaker: 'tomato', type: 'skipped' }
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.conversation, manager.conversationOptions.characters)).toBe(2); // Potato
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
                expect(SpeakerSelector.calculateNextSpeaker(manager.conversation, manager.conversationOptions.characters)).toBe(2);
            });

            it('should move from panelist to next food', () => {
                manager.conversation = [
                    { speaker: 'alice', type: 'message' }
                ];
                expect(SpeakerSelector.calculateNextSpeaker(manager.conversation, manager.conversationOptions.characters)).toBe(3);
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
                manager.conversation = [
                    { speaker: 'tomato', type: 'message' },
                    { speaker: 'Frank', type: 'human' }
                ];
                expect(SpeakerSelector.calculateNextSpeaker(manager.conversation, manager.conversationOptions.characters)).toBe(2); // Alice
            });


            it('should return to order after Food responds to Hand Raise (Interrupting Panelist)', () => {
                manager.conversation = [
                    { speaker: 'tomato', type: 'message' },
                    { speaker: 'Frank', type: 'human', askParticular: 'Potato' },
                    { speaker: 'potato', type: 'response' }
                ];

                expect(SpeakerSelector.calculateNextSpeaker(manager.conversation, manager.conversationOptions.characters)).toBe(2); // Alice
            });

            it('should handle multiple panelists and hand raises mingled', () => {
                manager.conversationOptions.characters = [
                    { id: 'water', name: 'Water', type: 'food' },
                    { id: 'tomato', name: 'Tomato', type: 'food' },
                    { id: 'alice', name: 'Alice', type: 'panelist' },
                    { id: 'bob', name: 'Bob', type: 'panelist' },
                    { id: 'potato', name: 'Potato', type: 'food' }
                ];

                manager.conversation = [
                    { speaker: 'alice', type: 'message' }
                ];
                expect(SpeakerSelector.calculateNextSpeaker(manager.conversation, manager.conversationOptions.characters)).toBe(3); // Bob
            });
        });
    });
});
