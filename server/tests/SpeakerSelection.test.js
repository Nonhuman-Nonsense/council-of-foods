import { describe, it, expect, beforeEach } from 'vitest';
import { createTestManager } from './commonSetup.js';
import { SpeakerSelector } from '@logic/SpeakerSelector.js';

describe('MeetingManager - Speaker Selection', () => {
    let manager;

    beforeEach(() => {
        const setup = createTestManager();
        manager = setup.manager;
    });

    describe('calculateCurrentSpeaker', () => {
        it('should start with the first speaker if conversation is empty', () => {
            manager.meeting.conversation = [];
            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(0); // Water
        });

        it('should rotate to the next speaker', () => {
            manager.meeting.conversation = [
                { speaker: 'water', type: 'message' }
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(1); // Tomato
        });

        it('should loop back to the first speaker from the last', () => {
            manager.meeting.conversation = [
                { speaker: 'potato', type: 'message' }
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(0); // Water
        });

        it('should skip invitations when calculating next speaker', () => {
            manager.meeting.conversation = [
                { speaker: 'water', type: 'message' },
                { speaker: 'water', type: 'invitation' } // Chair/System message
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(1);
        });

        it('should answer direct questions from human', () => {
            manager.meeting.conversation = [
                { speaker: 'water', type: 'message' },
                // Frank (the human) asks Potato directly
                { speaker: 'Frank', type: 'human', askParticular: 'Potato' }
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(2); // Potato
        });

        it('should also route direct questions when askParticular stores a character id', () => {
            manager.meeting.conversation = [
                { speaker: 'water', type: 'message' },
                { speaker: 'Frank', type: 'human', askParticular: 'potato' }
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(2); // Potato
        });

        it('should return to natural order after a direct response', () => {
            manager.meeting.conversation = [
                { speaker: 'water', type: 'message' },         // Index 0
                { speaker: 'Frank', type: 'human', askParticular: 'Potato' }, // Index 1
                { speaker: 'potato', type: 'response' }        // Index 2 (Response to human)
            ];

            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(1); // Tomato
        });

        it('should continue normally if the "response" was actually the correct turn anyway', () => {
            manager.meeting.conversation = [
                { speaker: 'water', type: 'message' },
                { speaker: 'Frank', type: 'human', askParticular: 'Tomato' },
                { speaker: 'tomato', type: 'response' }
            ];

            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(2); // Potato
        });

        it('should ignore human input if it is not a direct question', () => {
            manager.meeting.conversation = [
                { speaker: 'water', type: 'message' },
                { speaker: 'Frank', type: 'human' } // Generic comment
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(1); // Tomato
        });

        it('should handle skipped messages by moving to the next speaker', () => {
            manager.meeting.conversation = [
                { speaker: 'water', type: 'message' },
                { speaker: 'tomato', type: 'skipped' }
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(2); // Potato
        });

        // --- Panelist Tests ---
        describe('Panelist Logic', () => {
            beforeEach(() => {
                // Add a human panelist "Alice" between Tomato and Potato
                manager.meeting.characters = [
                    { id: 'water', name: 'Water', description: '', prompt: '', voice: 'alloy' },
                    { id: 'tomato', name: 'Tomato', description: '', prompt: '', voice: 'alloy' },
                    { id: 'panelist0', name: 'Alice', description: '', prompt: '', voice: 'alloy' },
                    { id: 'potato', name: 'Potato', description: '', prompt: '', voice: 'alloy' }
                ];
            });

            it('should treat panelists as normal speakers in rotation', () => {
                manager.meeting.conversation = [
                    { speaker: 'tomato', type: 'message' }
                ];
                expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(2);
            });

            it('should move from panelist to next food', () => {
                manager.meeting.conversation = [
                    { speaker: 'panelist0', type: 'message' }
                ];
                expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(3);
            });
        });

        // --- Complex Interaction Tests ---
        describe('Complex Interactions', () => {
            beforeEach(() => {
                // Setup mixed council
                manager.meeting.characters = [
                    { id: 'water', name: 'Water', description: '', prompt: '', voice: 'alloy' },     // 0
                    { id: 'tomato', name: 'Tomato', description: '', prompt: '', voice: 'alloy' },   // 1
                    { id: 'panelist0', name: 'Alice', description: '', prompt: '', voice: 'alloy' }, // 2
                    { id: 'potato', name: 'Potato', description: '', prompt: '', voice: 'alloy' }    // 3
                ];
            });

            it('should handle Hand Raise (Frank) during Panelist turn', () => {
                manager.meeting.conversation = [
                    { speaker: 'tomato', type: 'message' },
                    { speaker: 'Frank', type: 'human' }
                ];
                expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(2); // Alice
            });


            it('should return to order after Food responds to Hand Raise (Interrupting Panelist)', () => {
                manager.meeting.conversation = [
                    { speaker: 'tomato', type: 'message' },
                    { speaker: 'Frank', type: 'human', askParticular: 'Potato' },
                    { speaker: 'potato', type: 'response' }
                ];

                expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(2); // Alice
            });

            it('should handle multiple panelists and hand raises mingled', () => {
                manager.meeting.characters = [
                    { id: 'water', name: 'Water', description: '', prompt: '', voice: 'alloy' },
                    { id: 'tomato', name: 'Tomato', description: '', prompt: '', voice: 'alloy' },
                    { id: 'panelist0', name: 'Alice', description: '', prompt: '', voice: 'alloy' },
                    { id: 'panelist1', name: 'Bob', description: '', prompt: '', voice: 'alloy' },
                    { id: 'potato', name: 'Potato', description: '', prompt: '', voice: 'alloy' }
                ];

                manager.meeting.conversation = [
                    { speaker: 'panelist0', type: 'message' }
                ];
                expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(3); // Bob
            });
        });
    });
});
