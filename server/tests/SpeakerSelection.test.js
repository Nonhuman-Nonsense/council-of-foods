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

        it('should count skipped panelist turns in least-spoken routing', () => {
            const chairId = manager.meeting.characters[0].id;
            const [chair, firstSpeaker, thirdSpeaker] = DEFAULT_TEST_CHARACTERS;
            manager.meeting.characters = [
                MockFactory.createCharacter(chair),
                MockFactory.createCharacter(firstSpeaker),
                { id: 'panelist0', name: 'Alice', description: '', prompt: '', voice: 'alloy' },
                MockFactory.createCharacter(thirdSpeaker),
            ];
            manager.meeting.conversation = [
                { speaker: chairId, type: 'message' },
                { speaker: 'panelist0', type: 'skipped' },
            ];

            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters, {
                directedSpeakerRouting: true,
                chairId,
            })).toBe(1); // Tomato has 0 messages; panelist0 already took a turn via skip
        });

        it('should count skipped turns toward chair cadence', () => {
            const chairId = manager.meeting.characters[0].id;
            manager.meeting.conversation = [
                { speaker: chairId, type: 'message' },
                { speaker: manager.meeting.characters[1].id, type: 'skipped' },
                { speaker: manager.meeting.characters[2].id, type: 'message' },
            ];

            expect(SpeakerSelector.calculateNextSpeaker(manager.meeting.conversation, manager.meeting.characters, {
                directedSpeakerRouting: true,
                chairId,
            })).toBe(0); // chair forced after other participants have taken turns (skipped counts)
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

            it('should move from skipped human panelist to next character in rotation', () => {
                manager.meeting.conversation = [
                    { speaker: manager.meeting.characters[1].id, type: 'message' },
                    { speaker: 'panelist0', type: 'skipped', text: '' },
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

            it('uses initial lineup order to break ties among equally quiet participants', () => {
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
                })).toBe(2); // Potato and Lollipop are tied at 0; lineup order picks Potato
            });

            it('picks the earliest-in-lineup quiet participant after a directed ask skips the natural turn', () => {
                const chairId = 'river';
                const characters = [
                    MockFactory.createCharacter({ id: 'river', name: 'River' }),
                    MockFactory.createCharacter({ id: 'bumblebee', name: 'Bumblebee' }),
                    MockFactory.createCharacter({ id: 'reindeer', name: 'Reindeer' }),
                    MockFactory.createCharacter({ id: 'salmon', name: 'Salmon' }),
                ];
                const conversation = [
                    { speaker: 'river', type: 'message', askParticular: 'reindeer' },
                    { speaker: 'reindeer', type: 'response' },
                ];

                expect(SpeakerSelector.calculateNextSpeaker(conversation, characters, {
                    directedSpeakerRouting: true,
                    chairId,
                })).toBe(1); // Bumblebee and Salmon are tied at 0; lineup order picks Bumblebee
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

        describe('Directed speaker routing priority', () => {
            // River chairs; Ada (a human panelist) sits after three beings, so she is due after 3 turns.
            // The chair is due once the 6 others have had a turn since it last spoke.
            const characters = ['river', 'f1', 'f2', 'f3', 'panelist0', 'f4', 'f5'].map((id) =>
                MockFactory.createCharacter({ id, name: id })
            );
            const say = (speaker, askParticular) => ({ speaker, type: 'message', ...(askParticular && { askParticular }) });
            const answer = (speaker, askParticular) => ({ speaker, type: 'response', ...(askParticular && { askParticular }) });
            const ada = (askParticular) => ({ speaker: 'panelist0', type: 'panelist', ...(askParticular && { askParticular }) });
            const roundOne = [say('river'), say('f1'), say('f2'), say('f3'), ada(), say('f4'), say('f5')];

            it.each([
                { behavior: 'the human waits for the beings ahead of them in the lineup', conversation: [say('river'), say('f1'), say('f2')], expected: 'f3' },
                { behavior: 'the human comes in once their place in the lineup has passed', conversation: [say('river'), say('f1'), say('f2'), say('f3')], expected: 'panelist0' },
                { behavior: 'an answer can ask back while no cadence is due', conversation: [say('river', 'f2'), answer('f2', 'f1'), answer('f1', 'f2')], expected: 'f2' },
                { behavior: 'a due human beats a question asked inside an answer', conversation: [say('river', 'f2'), answer('f2', 'f1'), answer('f1', 'f2'), answer('f2', 'f3')], expected: 'panelist0' },
                { behavior: 'a first question is answered even when the human is due', conversation: [say('river'), say('f1'), say('f2'), say('f3', 'f1')], expected: 'f1' },
                { behavior: 'a being can ask the human before their place in the lineup', conversation: [say('river'), say('f1', 'panelist0')], expected: 'panelist0' },
                { behavior: 'the chair can ask the human straight away', conversation: [say('river', 'panelist0')], expected: 'panelist0' },
                { behavior: 'a skipped human turn counts as their turn', conversation: [say('river'), say('f1'), say('f2'), say('f3'), { speaker: 'panelist0', type: 'skipped' }], expected: 'f4' },
                { behavior: 'the chair returns once two beings have replied to the human', conversation: roundOne, expected: 'river' },
                { behavior: 'the chair waits for two beings to reply to the human even when due', conversation: [say('river'), say('f1'), say('f2'), say('f3'), say('f4'), say('f5'), ada(), say('f1')], expected: 'f2' },
                { behavior: 'no wait for the chair after a human skipped their turn', conversation: [say('river'), say('f1'), say('f2'), say('f3'), { speaker: 'panelist0', type: 'skipped' }, say('f4'), say('f5')], expected: 'river' },
                { behavior: 'a first question beats a due chair', conversation: [...roundOne.slice(0, -1), say('f5', 'f1')], expected: 'f1' },
                { behavior: 'a due chair beats a question asked inside an answer', conversation: [...roundOne.slice(0, -1), answer('f5', 'f1')], expected: 'river' },
                { behavior: 'a human and a being asking each other back and forth give way to the chair', conversation: [...roundOne.slice(0, 4), ada('f4'), answer('f4', 'panelist0'), ada('f4'), answer('f4', 'panelist0')], expected: 'river' },
                { behavior: 'a hand-raised question also makes the chair wait for two replies', conversation: [...roundOne.slice(0, 6), { speaker: 'Frank', type: 'human', askParticular: 'f5' }, answer('f5')], expected: 'f1' },
            ])('$behavior', ({ conversation, expected }) => {
                const next = SpeakerSelector.calculateNextSpeaker(conversation, characters, {
                    directedSpeakerRouting: true,
                    chairId: 'river',
                });
                expect(characters[next].id).toBe(expected);
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
