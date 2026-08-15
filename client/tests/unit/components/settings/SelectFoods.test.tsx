
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SelectCharacters, { type SelectCharactersProps } from '@newMeeting/SelectCharacters';
import { characterSetupEn } from '../../../characterSetupTestData';
import { useMeetingSetupStore } from '@newMeeting/meetingSetupStore';
import type { Character } from '@shared/ModelTypes';

// Mock dependencies
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
}));

vi.mock('@/utils', () => ({
    useMobile: () => false,
    useMobileXs: () => false,
    toTitleCase: (str: string) => str,
    filename: (str: string) => str
}));

const [chair, ...selectableCharacters] = characterSetupEn.characters;
const [firstParticipant, secondParticipant] = selectableCharacters;
const maxParticipantSelection = selectableCharacters.slice(0, 6);
const overflowParticipant = selectableCharacters[6];

function clickCharacter(name: string) {
    fireEvent.click(screen.getByAltText(name));
}

function selectMinimumParticipants() {
    clickCharacter(firstParticipant.name);
    clickCharacter(secondParticipant.name);
}

describe('SelectCharacters Component', () => {
    let mockOnContinue: ReturnType<typeof vi.fn<(data: { characters: Character[] }) => void>>;

    beforeEach(() => {
        useMeetingSetupStore.getState().resetStore();
        mockOnContinue = vi.fn();
    });

    function ControlledSelectCharacters(props: Partial<SelectCharactersProps> = {}) {
        return (
            <SelectCharacters
                topicTitle="Test Topic"
                onContinueForward={mockOnContinue}
                {...props}
            />
        );
    }

    it('should render correctly with default chair selected', () => {
        render(<ControlledSelectCharacters />);

        expect(screen.getByAltText(chair.name)).toBeInTheDocument();
    });

    it('should enforce min participants (2) before allowing Start', () => {
        render(<ControlledSelectCharacters />);

        expect(screen.queryByText('app.start')).not.toBeInTheDocument();
        expect(screen.getByText('meeting.characters.pleaseselect')).toBeInTheDocument();

        clickCharacter(firstParticipant.name);
        expect(screen.queryByText('app.start')).not.toBeInTheDocument();

        clickCharacter(secondParticipant.name);
        expect(screen.getByText('app.start')).toBeInTheDocument();
    });

    it('should pass selected characters to onContinueForward', () => {
        render(<ControlledSelectCharacters />);

        selectMinimumParticipants();
        fireEvent.click(screen.getByText('app.start'));

        expect(mockOnContinue).toHaveBeenCalledTimes(1);
        const passedCharacters = mockOnContinue.mock.calls[0][0].characters;

        expect(passedCharacters).toHaveLength(3);
        expect(passedCharacters.map((character: Character) => character.id)).toEqual([
            chair.id,
            firstParticipant.id,
            secondParticipant.id,
        ]);
        expect(passedCharacters.map((character: Character) => character.name)).toEqual([
            chair.name,
            firstParticipant.name,
            secondParticipant.name,
        ]);
    });

    it('should include human panelists in the selected characters', async () => {
        render(<ControlledSelectCharacters />);

        selectMinimumParticipants();

        const addBtn = screen.getByAltText('add human');
        fireEvent.click(addBtn);

        const nameInput = screen.getByPlaceholderText('meeting.characters.humanname');
        const descInput = screen.getByPlaceholderText('meeting.characters.humandesc');

        fireEvent.change(nameInput, { target: { value: 'Alice' } });
        fireEvent.change(descInput, { target: { value: 'A thoughtful human' } });

        const startBtn = await screen.findByText('app.start');
        fireEvent.click(startBtn);

        const passedCharacters = mockOnContinue.mock.calls[0][0].characters;
        const humanPanelist = passedCharacters.find((character: Character) => character.id.startsWith("panelist"));
        if (!humanPanelist) throw new Error('expected a human panelist in passedCharacters');

        expect(passedCharacters.map((character: Character) => character.id)).toEqual([
            chair.id,
            firstParticipant.id,
            secondParticipant.id,
            'panelist0',
        ]);
        expect(humanPanelist).toEqual(expect.objectContaining({
            name: 'Alice',
            description: 'A thoughtful human',
        }));

        expect(humanPanelist.voice).toBe(chair.voice);
        expect(humanPanelist.voiceProvider).toBe(chair.voiceProvider);
        expect(humanPanelist.voiceTemperature).toBe(chair.voiceTemperature);
        expect(humanPanelist.voiceInstruction).toBe(chair.voiceInstruction);
        expect(humanPanelist.voiceLocale).toBe(chair.voiceLocale);
    });

    it('should maintain focus on description when typing', async () => {
        render(<ControlledSelectCharacters />);

        const addBtn = screen.getByAltText('add human');
        fireEvent.click(addBtn);

        const nameInput = screen.getByPlaceholderText('meeting.characters.humanname');
        const descInput = screen.getByPlaceholderText('meeting.characters.humandesc');

        expect(document.activeElement).toBe(nameInput);

        descInput.focus();
        expect(document.activeElement).toBe(descInput);

        fireEvent.change(descInput, { target: { value: 'A' } });

        expect(document.activeElement).toBe(descInput);
    });

    it('should prevent selecting more than max participants (6)', () => {
        expect(maxParticipantSelection).toHaveLength(6);
        expect(overflowParticipant).toBeDefined();

        render(<ControlledSelectCharacters />);

        maxParticipantSelection.forEach((character) => {
            clickCharacter(character.name);
        });

        clickCharacter(overflowParticipant.name);

        fireEvent.click(screen.getByText('app.start'));

        const passedCharacters = mockOnContinue.mock.calls[0][0].characters;

        expect(passedCharacters.length).toBeLessThanOrEqual(7);
        expect(passedCharacters.map((character: Character) => character.name)).not.toContain(overflowParticipant.name);
    });

    it('should deselect a food when clicked again', () => {
        render(<ControlledSelectCharacters />);

        const participantBtn = screen.getByAltText(firstParticipant.name);

        fireEvent.click(participantBtn);
        fireEvent.click(participantBtn);

        expect(screen.queryByText('app.start')).not.toBeInTheDocument();
    });

    it('should show error when human panelists have duplicate names', async () => {
        render(<ControlledSelectCharacters />);

        selectMinimumParticipants();

        const addBtn = screen.getByAltText('add human');
        fireEvent.click(addBtn);

        let nameInput = screen.getByPlaceholderText('meeting.characters.humanname');
        let descInput = screen.getByPlaceholderText('meeting.characters.humandesc');
        fireEvent.change(nameInput, { target: { value: 'Bob' } });
        fireEvent.change(descInput, { target: { value: 'Desc 1' } });

        fireEvent.click(addBtn);

        nameInput = screen.getByPlaceholderText('meeting.characters.humanname');
        descInput = screen.getByPlaceholderText('meeting.characters.humandesc');
        fireEvent.change(nameInput, { target: { value: 'Bob' } });
        fireEvent.change(descInput, { target: { value: 'Desc 2' } });

        expect(await screen.findByText('meeting.characters.unique')).toBeInTheDocument();
        expect(screen.queryByText('app.start')).not.toBeInTheDocument();
    });

    /**
     * These feed the setup agent's spoken reactions. Reactions are debounced,
     * so a burst of picks collapses into one event — hence each carries the
     * resulting council, and events only fire when the selection really moved.
     */
    describe('selection callbacks for the setup agent', () => {
        it('reports the resulting council when a food is selected', () => {
            const onCharacterSelected = vi.fn();
            render(<ControlledSelectCharacters onCharacterSelected={onCharacterSelected} />);

            clickCharacter(firstParticipant.name);
            expect(onCharacterSelected).toHaveBeenCalledWith([firstParticipant.name], chair.name, false);

            clickCharacter(secondParticipant.name);
            expect(onCharacterSelected).toHaveBeenLastCalledWith(
                [firstParticipant.name, secondParticipant.name],
                chair.name,
                false,
            );
        });

        it('reports the resulting council when a food is deselected', () => {
            const onCharacterDeselected = vi.fn();
            render(<ControlledSelectCharacters onCharacterDeselected={onCharacterDeselected} />);

            clickCharacter(firstParticipant.name);
            clickCharacter(firstParticipant.name);

            expect(onCharacterDeselected).toHaveBeenCalledWith([], chair.name, false);
        });

        it('stays silent when the council is full and the pick is rejected', () => {
            const onCharacterSelected = vi.fn();
            render(<ControlledSelectCharacters onCharacterSelected={onCharacterSelected} />);

            maxParticipantSelection.forEach((character) => {
                clickCharacter(character.name);
            });
            onCharacterSelected.mockClear();

            clickCharacter(overflowParticipant.name);

            expect(onCharacterSelected).not.toHaveBeenCalled();
        });

        /**
         * The UI has no room for a 7th pick, so the click that fills the last
         * slot is the only moment the setup agent can learn the council is full.
         */
        it('reports isFull once the last slot is taken, but not before', () => {
            const onCharacterSelected = vi.fn();
            render(<ControlledSelectCharacters onCharacterSelected={onCharacterSelected} />);

            maxParticipantSelection.forEach((character) => {
                clickCharacter(character.name);
            });

            const isFullFlags = onCharacterSelected.mock.calls.map((call) => call[2]);
            expect(isFullFlags.slice(0, -1)).toEqual(isFullFlags.slice(0, -1).map(() => false));
            expect(isFullFlags[isFullFlags.length - 1]).toBe(true);
        });

        it('reports the whole council after randomizing', () => {
            const onCharactersRandomized = vi.fn();
            render(<ControlledSelectCharacters onCharactersRandomized={onCharactersRandomized} />);

            fireEvent.click(screen.getByText('meeting.characters.random'));

            expect(onCharactersRandomized).toHaveBeenCalledTimes(1);
            const [selectedNames, chairName] = onCharactersRandomized.mock.calls[0];
            expect(chairName).toBe(chair.name);
            expect(selectedNames.length).toBeGreaterThan(0);
            expect(selectedNames).not.toContain(chair.name);
        });

        describe('human panelist callbacks', () => {
            it('reports a newly added panelist as blank, so the message asks for details', () => {
                const onHumanSelected = vi.fn();
                render(<ControlledSelectCharacters onHumanSelected={onHumanSelected} />);

                fireEvent.click(screen.getByAltText('add human'));

                expect(onHumanSelected).toHaveBeenCalledTimes(1);
                const [details] = onHumanSelected.mock.calls[0];
                expect(details.chairName).toBe(chair.name);
                expect(details.isFull).toBe(false);
                // Panelists aren't foods — adding one shouldn't appear here.
                expect(details.selectedNames).toEqual([]);
                // The freshly added panelist has no name yet, so it isn't
                // listed as a named participant either.
                expect(details.panelistNames).toEqual([]);
                expect(details.humanName).toBe('');
            });

            /**
             * A deselected panelist keeps their card and details, so clicking
             * it again puts them back in the council. That path fired nothing
             * before, which left the agent unaware — and let a pending
             * "deselected" reaction go out describing a state already undone.
             */
            it('reports an existing panelist toggled back in, carrying their details', () => {
                const onHumanSelected = vi.fn();
                render(<ControlledSelectCharacters onHumanSelected={onHumanSelected} />);

                fireEvent.click(screen.getByAltText('add human'));
                fireEvent.change(screen.getByPlaceholderText('meeting.characters.humanname'), {
                    target: { value: 'Leo' },
                });
                fireEvent.change(screen.getByPlaceholderText('meeting.characters.humandesc'), {
                    target: { value: 'A curious visitor' },
                });
                clickCharacter('Leo'); // out of the council
                onHumanSelected.mockClear();

                clickCharacter('Leo'); // and back in

                expect(onHumanSelected).toHaveBeenCalledWith(expect.objectContaining({
                    humanName: 'Leo',
                    humanDescription: 'A curious visitor',
                    isComplete: true,
                    panelistNames: ['Leo'],
                }));
            });

            it('reports typed details, distinguishing what is still missing', () => {
                const onHumanDetailsTyped = vi.fn();
                render(<ControlledSelectCharacters onHumanDetailsTyped={onHumanDetailsTyped} />);

                fireEvent.click(screen.getByAltText('add human'));
                const nameInput = screen.getByPlaceholderText('meeting.characters.humanname');
                fireEvent.change(nameInput, { target: { value: 'Alex' } });

                expect(onHumanDetailsTyped).toHaveBeenLastCalledWith(expect.objectContaining({
                    humanName: 'Alex',
                    humanDescription: '',
                    isComplete: false,
                }));

                const descInput = screen.getByPlaceholderText('meeting.characters.humandesc');
                fireEvent.change(descInput, { target: { value: 'A curious economist' } });

                expect(onHumanDetailsTyped).toHaveBeenLastCalledWith(expect.objectContaining({
                    humanName: 'Alex',
                    humanDescription: 'A curious economist',
                    isComplete: true,
                }));
            });

            it('reports confirmed details once the visitor clicks elsewhere', () => {
                const onHumanDetailsConfirmed = vi.fn();
                render(<ControlledSelectCharacters onHumanDetailsConfirmed={onHumanDetailsConfirmed} />);

                fireEvent.click(screen.getByAltText('add human'));
                fireEvent.change(screen.getByPlaceholderText('meeting.characters.humanname'), {
                    target: { value: 'Alex' },
                });

                expect(onHumanDetailsConfirmed).not.toHaveBeenCalled();

                clickCharacter(firstParticipant.name);

                expect(onHumanDetailsConfirmed).toHaveBeenCalledWith(expect.objectContaining({
                    humanName: 'Alex',
                    humanDescription: '',
                    isComplete: false,
                    // Already selected (even mid-edit), so it belongs in the
                    // roster — the reaction message says "the council is now
                    // Alex..." rather than omitting them entirely.
                    panelistNames: ['Alex'],
                }));
            });

            /**
             * The reported bug: a message said "the visitor just finished
             * describing a panelist" and, in the same breath, "the council is
             * currently just yourself, the moderator" — a direct contradiction
             * that led the agent to call the add-panelist tool again, creating
             * a duplicate. The roster must include every named panelist, not
             * just foods, so the two halves of the message never disagree.
             */
            it('includes named panelists in the roster so the message never contradicts itself', () => {
                const onHumanDetailsConfirmed = vi.fn();
                render(<ControlledSelectCharacters onHumanDetailsConfirmed={onHumanDetailsConfirmed} />);

                fireEvent.click(screen.getByAltText('add human'));
                fireEvent.change(screen.getByPlaceholderText('meeting.characters.humanname'), {
                    target: { value: 'Leo Fidjeland' },
                });
                fireEvent.change(screen.getByPlaceholderText('meeting.characters.humandesc'), {
                    target: { value: 'I am not sure what to write here' },
                });

                clickCharacter(firstParticipant.name);

                expect(onHumanDetailsConfirmed).toHaveBeenCalledWith(expect.objectContaining({
                    humanName: 'Leo Fidjeland',
                    isComplete: true,
                    panelistNames: ['Leo Fidjeland'],
                }));
            });

            it('does not report confirmed details for a click-in-click-out with no edit', () => {
                const onHumanDetailsConfirmed = vi.fn();
                render(<ControlledSelectCharacters onHumanDetailsConfirmed={onHumanDetailsConfirmed} />);

                fireEvent.click(screen.getByAltText('add human'));
                clickCharacter(firstParticipant.name);

                expect(onHumanDetailsConfirmed).not.toHaveBeenCalled();
            });

            /**
             * Hovering a different card swaps the info panel and unmounts the
             * active textarea (see `infoToShow`), which fires a native blur —
             * but hovering isn't "the visitor is done", so this must not count
             * as confirming. Regression test for relying on blur instead of
             * `lastSelected`.
             */
            it('does not report confirmed details from merely hovering another card', () => {
                const onHumanDetailsConfirmed = vi.fn();
                render(<ControlledSelectCharacters onHumanDetailsConfirmed={onHumanDetailsConfirmed} />);

                fireEvent.click(screen.getByAltText('add human'));
                fireEvent.change(screen.getByPlaceholderText('meeting.characters.humanname'), {
                    target: { value: 'Alex' },
                });

                fireEvent.mouseEnter(screen.getByAltText(firstParticipant.name));
                fireEvent.mouseLeave(screen.getByAltText(firstParticipant.name));

                expect(onHumanDetailsConfirmed).not.toHaveBeenCalled();
            });

            /**
             * Leaving the food-selection step (starting the meeting, or going
             * back to topic selection) unmounts this screen and so runs the
             * same cleanup that reports "finished describing". The visitor
             * didn't finish anything — and reacting here would have the agent
             * discussing panelists during the topic step.
             */
            it('does not report confirmed details when the step is left entirely', () => {
                const onHumanDetailsConfirmed = vi.fn();
                const { unmount } = render(
                    <ControlledSelectCharacters onHumanDetailsConfirmed={onHumanDetailsConfirmed} />,
                );

                fireEvent.click(screen.getByAltText('add human'));
                fireEvent.change(screen.getByPlaceholderText('meeting.characters.humanname'), {
                    target: { value: 'Alex' },
                });

                unmount();

                expect(onHumanDetailsConfirmed).not.toHaveBeenCalled();
            });

            /**
             * Removing a panelist deselects them by clicking their own card
             * again — which also moves `lastSelected` away from them, the same
             * signal the "confirmed" reaction watches. Without a fix, removal
             * fired a "finished describing" reaction for someone no longer in
             * the council; it should fire this instead.
             */
            it('reports a removed panelist, not a confirmed-details reaction', () => {
                const onHumanDeselected = vi.fn();
                const onHumanDetailsConfirmed = vi.fn();
                render(<ControlledSelectCharacters
                    onHumanDeselected={onHumanDeselected}
                    onHumanDetailsConfirmed={onHumanDetailsConfirmed}
                />);

                fireEvent.click(screen.getByAltText('add human'));
                fireEvent.change(screen.getByPlaceholderText('meeting.characters.humanname'), {
                    target: { value: 'Leo' },
                });
                fireEvent.change(screen.getByPlaceholderText('meeting.characters.humandesc'), {
                    target: { value: 'A curious visitor' },
                });

                clickCharacter('Leo'); // deselect — the card's alt text tracks the typed name

                expect(onHumanDeselected).toHaveBeenCalledWith('Leo', expect.objectContaining({
                    chairName: chair.name,
                    panelistNames: [],
                }));
                expect(onHumanDetailsConfirmed).not.toHaveBeenCalled();
            });

            it('does not report removal of a panelist that was never named', () => {
                const onHumanDeselected = vi.fn();
                const { container } = render(<ControlledSelectCharacters onHumanDeselected={onHumanDeselected} />);

                fireEvent.click(screen.getByAltText('add human'));
                const panelistImg = Array.from(container.querySelectorAll('img'))
                    .find((img) => img.getAttribute('alt') === '');
                if (!panelistImg) throw new Error('expected a blank-named panelist image');

                fireEvent.click(panelistImg); // deselect without ever typing anything

                expect(onHumanDeselected).not.toHaveBeenCalled();
            });

            /**
             * `currentPanelistNames` filters by `selectedCharacters`, not just
             * array position — otherwise a removed panelist's name lingers
             * (their `humans[]` entry survives deselection) and keeps showing
             * up in a still-selected panelist's own roster line.
             */
            it('excludes a removed panelist from another panelist\'s roster', () => {
                const onHumanDetailsTyped = vi.fn();
                render(<ControlledSelectCharacters onHumanDetailsTyped={onHumanDetailsTyped} />);

                fireEvent.click(screen.getByAltText('add human'));
                fireEvent.change(screen.getByPlaceholderText('meeting.characters.humanname'), {
                    target: { value: 'Bob' },
                });
                fireEvent.change(screen.getByPlaceholderText('meeting.characters.humandesc'), {
                    target: { value: 'The first panelist' },
                });
                clickCharacter('Bob'); // deselect: Bob is removed

                fireEvent.click(screen.getByAltText('add human'));
                fireEvent.change(screen.getByPlaceholderText('meeting.characters.humanname'), {
                    target: { value: 'Alice' },
                });

                expect(onHumanDetailsTyped).toHaveBeenLastCalledWith(expect.objectContaining({
                    humanName: 'Alice',
                    panelistNames: ['Alice'],
                }));
            });
        });
    });
});
