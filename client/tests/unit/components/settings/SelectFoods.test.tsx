
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
            expect(onCharacterSelected).toHaveBeenCalledWith([firstParticipant.name], chair.name);

            clickCharacter(secondParticipant.name);
            expect(onCharacterSelected).toHaveBeenLastCalledWith(
                [firstParticipant.name, secondParticipant.name],
                chair.name,
            );
        });

        it('reports the resulting council when a food is deselected', () => {
            const onCharacterDeselected = vi.fn();
            render(<ControlledSelectCharacters onCharacterDeselected={onCharacterDeselected} />);

            clickCharacter(firstParticipant.name);
            clickCharacter(firstParticipant.name);

            expect(onCharacterDeselected).toHaveBeenCalledWith([], chair.name);
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
    });
});
