import { describe, it, expect, beforeEach } from 'vitest';
import { createTestManager } from './commonSetup.js';
import { SpeakerSelector } from '@logic/SpeakerSelector.js';
import { DEFAULT_TEST_CHARACTERS, MockFactory } from './factories/MockFactory.ts';

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
                { speaker: manager.meeting.characters[0].id, type: 'message' }
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(1); // Tomato
        });

        it('should loop back to the first speaker from the last', () => {
            manager.meeting.conversation = [
                { speaker: manager.meeting.characters[2].id, type: 'message' }
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(0); // Water
        });

        it('should skip invitations when calculating next speaker', () => {
            manager.meeting.conversation = [
                { speaker: manager.meeting.characters[0].id, type: 'message' },
                { speaker: manager.meeting.characters[0].id, type: 'invitation' } // Chair/System message
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(1);
        });

        it('should answer direct questions from human', () => {
            manager.meeting.conversation = [
                { speaker: manager.meeting.characters[0].id, type: 'message' },
                { speaker: 'Frank', type: 'human', askParticular: manager.meeting.characters[2].name }
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(2); // Potato
        });

        it('should also route direct questions when askParticular stores a character id', () => {
            manager.meeting.conversation = [
                { speaker: manager.meeting.characters[0].id, type: 'message' },
                { speaker: 'Frank', type: 'human', askParticular: manager.meeting.characters[2].id }
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(2); // Potato
        });

        it('should return to natural order after a direct response', () => {
            manager.meeting.conversation = [
                { speaker: manager.meeting.characters[0].id, type: 'message' },         // Index 0
                { speaker: 'Frank', type: 'human', askParticular: manager.meeting.characters[2].name }, // Index 1
                { speaker: manager.meeting.characters[2].id, type: 'response' }        // Index 2 (Response to human)
            ];

            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(1); // Tomato
        });

        it('should continue normally if the "response" was actually the correct turn anyway', () => {
            manager.meeting.conversation = [
                { speaker: manager.meeting.characters[0].id, type: 'message' },
                { speaker: 'Frank', type: 'human', askParticular: manager.meeting.characters[1].name },
                { speaker: manager.meeting.characters[1].id, type: 'response' }
            ];

            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(2); // Potato
        });

        it('should ignore human input if it is not a direct question', () => {
            manager.meeting.conversation = [
                { speaker: manager.meeting.characters[0].id, type: 'message' },
                { speaker: 'Frank', type: 'human' } // Generic comment
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(1); // Tomato
        });

        it('should handle skipped messages by moving to the next speaker', () => {
            manager.meeting.conversation = [
                { speaker: manager.meeting.characters[0].id, type: 'message' },
                { speaker: manager.meeting.characters[1].id, type: 'skipped' }
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(2); // Potato
        });

        // --- Panelist Tests ---
        describe('Panelist Logic', () => {
            beforeEach(() => {
                const [chair, firstSpeaker, thirdSpeaker] = DEFAULT_TEST_CHARACTERS;
                manager.meeting.characters = [
                    MockFactory.createCharacter(chair),
                    MockFactory.createCharacter(firstSpeaker),
                    { id: 'panelist0', name: 'Alice', description: '', prompt: '', voice: 'alloy' },
                    MockFactory.createCharacter(thirdSpeaker)
                ];
            });

            it('should treat panelists as normal speakers in rotation', () => {
                manager.meeting.conversation = [
                    { speaker: manager.meeting.characters[1].id, type: 'message' }
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

        it('should route to askParticular on AI messages', () => {
            manager.meeting.conversation = [
                { speaker: manager.meeting.characters[0].id, type: 'message' },
                { speaker: manager.meeting.characters[1].id, type: 'message', askParticular: manager.meeting.characters[2].id }
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(2);
        });

        it('should skip AI askParticular once the target has responded', () => {
            manager.meeting.conversation = [
                { speaker: manager.meeting.characters[0].id, type: 'message' },
                { speaker: manager.meeting.characters[1].id, type: 'message', askParticular: manager.meeting.characters[2].id },
                { speaker: manager.meeting.characters[2].id, type: 'message' }
            ];
            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(0);
        });

        describe('Directed speaker routing open-floor fallback', () => {
            it('picks the participant with the fewest messages when the floor is open', () => {
                const chairId = manager.meeting.characters[0].id;
                manager.meeting.conversation = [
                    { speaker: chairId, type: 'message' },
                    { speaker: manager.meeting.characters[1].id, type: 'message' },
                ];

                expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters, {
                    directedSpeakerRouting: true,
                    chairId,
                })).toBe(2); // Potato has 0 messages; Tomato already has 1
            });

            it('prefers someone who has never spoken over frequent speakers', () => {
                const chairId = manager.meeting.characters[0].id;
                const [chair, tomato, potato, banana] = [
                    MockFactory.createCharacter(manager.meeting.characters[0]),
                    MockFactory.createCharacter({ id: 'tomato', name: 'Tomato' }),
                    MockFactory.createCharacter({ id: 'potato', name: 'Potato' }),
                    MockFactory.createCharacter({ id: 'banana', name: 'Banana' }),
                ];
                manager.meeting.characters = [chair, tomato, potato, banana];
                manager.meeting.conversation = [
                    { speaker: chairId, type: 'message' },
                    { speaker: tomato.id, type: 'message' },
                    { speaker: banana.id, type: 'message' },
                ];

                expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters, {
                    directedSpeakerRouting: true,
                    chairId,
                })).toBe(2); // Potato has 0 messages
            });

            it('uses round-robin order to break ties among equally quiet participants', () => {
                const chairId = manager.meeting.characters[0].id;
                const [chair, tomato, potato, banana, lollipop] = [
                    MockFactory.createCharacter(manager.meeting.characters[0]),
                    MockFactory.createCharacter({ id: 'tomato', name: 'Tomato' }),
                    MockFactory.createCharacter({ id: 'potato', name: 'Potato' }),
                    MockFactory.createCharacter({ id: 'banana', name: 'Banana' }),
                    MockFactory.createCharacter({ id: 'lollipop', name: 'Lollipop' }),
                ];
                manager.meeting.characters = [chair, tomato, potato, banana, lollipop];
                manager.meeting.conversation = [
                    { speaker: chairId, type: 'message' },
                    { speaker: tomato.id, type: 'message' },
                    { speaker: banana.id, type: 'message' },
                ];

                expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters, {
                    directedSpeakerRouting: true,
                    chairId,
                })).toBe(4); // Potato and Lollipop are tied at 0; RR after Banana picks Lollipop
            });

            it('does not override a directed askParticular on the latest message', () => {
                const chairId = manager.meeting.characters[0].id;
                manager.meeting.conversation = [
                    { speaker: chairId, type: 'message' },
                    { speaker: manager.meeting.characters[1].id, type: 'message', askParticular: manager.meeting.characters[2].id },
                ];

                expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters, {
                    directedSpeakerRouting: true,
                    chairId,
                })).toBe(2);
            });
        });

        describe('Directed speaker routing chair cadence', () => {
            it('should force the chair after every other participant has spoken since chair last spoke', () => {
                const chairId = manager.meeting.characters[0].id;
                manager.meeting.conversation = [
                    { speaker: chairId, type: 'message' },
                    { speaker: manager.meeting.characters[1].id, type: 'message' },
                    { speaker: manager.meeting.characters[2].id, type: 'message', askParticular: manager.meeting.characters[1].id }
                ];

                expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters, {
                    directedSpeakerRouting: true,
                    chairId,
                })).toBe(0);
            });

            it('should not force the chair when directed routing is disabled', () => {
                const chairId = manager.meeting.characters[0].id;
                manager.meeting.conversation = [
                    { speaker: chairId, type: 'message' },
                    { speaker: manager.meeting.characters[1].id, type: 'message' },
                    { speaker: manager.meeting.characters[2].id, type: 'message', askParticular: manager.meeting.characters[1].id }
                ];

                expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters, {
                    directedSpeakerRouting: false,
                    chairId,
                })).toBe(1);
            });
        });

        // --- Complex Interaction Tests ---
        describe('Complex Interactions', () => {
            beforeEach(() => {
                const [chair, firstSpeaker, thirdSpeaker] = DEFAULT_TEST_CHARACTERS;
                manager.meeting.characters = [
                    MockFactory.createCharacter(chair),     // 0
                    MockFactory.createCharacter(firstSpeaker),   // 1
                    { id: 'panelist0', name: 'Alice', description: '', prompt: '', voice: 'alloy' }, // 2
                    MockFactory.createCharacter(thirdSpeaker)    // 3
                ];
            });

            it('should handle Hand Raise (Frank) during Panelist turn', () => {
                manager.meeting.conversation = [
                    { speaker: manager.meeting.characters[1].id, type: 'message' },
                    { speaker: 'Frank', type: 'human' }
                ];
                expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(2); // Alice
            });


            it('should return to order after Food responds to Hand Raise (Interrupting Panelist)', () => {
                manager.meeting.conversation = [
                    { speaker: manager.meeting.characters[1].id, type: 'message' },
                    { speaker: 'Frank', type: 'human', askParticular: manager.meeting.characters[3].name },
                    { speaker: manager.meeting.characters[3].id, type: 'response' }
                ];

                expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(2); // Alice
            });

            it('should handle multiple panelists and hand raises mingled', () => {
                const [chair, firstSpeaker, thirdSpeaker] = DEFAULT_TEST_CHARACTERS;
                manager.meeting.characters = [
                    MockFactory.createCharacter(chair),
                    MockFactory.createCharacter(firstSpeaker),
                    { id: 'panelist0', name: 'Alice', description: '', prompt: '', voice: 'alloy' },
                    { id: 'panelist1', name: 'Bob', description: '', prompt: '', voice: 'alloy' },
                    MockFactory.createCharacter(thirdSpeaker)
                ];

                manager.meeting.conversation = [
                    { speaker: 'panelist0', type: 'message' }
                ];
                expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters)).toBe(3); // Bob
            });
        });
    });
});
