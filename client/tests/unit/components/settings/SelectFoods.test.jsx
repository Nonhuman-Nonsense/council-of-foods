
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SelectCharacters from '@newMeeting/SelectCharacters';
import { characterSetupEn } from '../../../characterSetupTestData';
import { useMeetingSetupStore } from '@newMeeting/meetingSetupStore';

// Mock dependencies
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key) => key, i18n: { language: 'en' } }),
}));

vi.mock('@/utils', () => ({
    useMobile: () => false,
    useMobileXs: () => false,
    toTitleCase: (str) => str,
    filename: (str) => str
}));

const [chair, ...selectableCharacters] = characterSetupEn.characters;
const [firstParticipant, secondParticipant] = selectableCharacters;
const maxParticipantSelection = selectableCharacters.slice(0, 6);
const overflowParticipant = selectableCharacters[6];

function clickCharacter(name) {
    fireEvent.click(screen.getByAltText(name));
}

function selectMinimumParticipants() {
    clickCharacter(firstParticipant.name);
    clickCharacter(secondParticipant.name);
}

describe('SelectCharacters Component', () => {
    let mockOnContinue;

    beforeEach(() => {
        useMeetingSetupStore.getState().resetStore();
        mockOnContinue = vi.fn();
    });

    function ControlledSelectCharacters() {
        return (
            <SelectCharacters
                topicTitle="Test Topic"
                onContinueForward={mockOnContinue}
            />
        );
    }

    it('should render correctly with default chair selected', () => {
        render(<ControlledSelectCharacters />);

        expect(screen.getByAltText(chair.name)).toBeInTheDocument();
    });

    it('should enforce min participants (2) before allowing Start', () => {
        render(<ControlledSelectCharacters />);

        expect(screen.queryByText('start')).not.toBeInTheDocument();
        expect(screen.getByText('selectfoods.pleaseselect')).toBeInTheDocument();

        clickCharacter(firstParticipant.name);
        expect(screen.queryByText('start')).not.toBeInTheDocument();

        clickCharacter(secondParticipant.name);
        expect(screen.getByText('start')).toBeInTheDocument();
    });

    it('should pass selected characters to onContinueForward', () => {
        render(<ControlledSelectCharacters />);

        selectMinimumParticipants();
        fireEvent.click(screen.getByText('start'));

        expect(mockOnContinue).toHaveBeenCalledTimes(1);
        const passedCharacters = mockOnContinue.mock.calls[0][0].characters;

        expect(passedCharacters).toHaveLength(3);
        expect(passedCharacters.map((character) => character.id)).toEqual([
            chair.id,
            firstParticipant.id,
            secondParticipant.id,
        ]);
        expect(passedCharacters.map((character) => character.name)).toEqual([
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

        const nameInput = screen.getByPlaceholderText('selectfoods.humanname');
        const descInput = screen.getByPlaceholderText('selectfoods.humandesc');

        fireEvent.change(nameInput, { target: { value: 'Alice' } });
        fireEvent.change(descInput, { target: { value: 'A thoughtful human' } });

        const startBtn = await screen.findByText('start');
        fireEvent.click(startBtn);

        const passedCharacters = mockOnContinue.mock.calls[0][0].characters;
        const humanPanelist = passedCharacters.find((character) => character.id.startsWith("panelist"));

        expect(passedCharacters.map((character) => character.id)).toEqual([
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

        const nameInput = screen.getByPlaceholderText('selectfoods.humanname');
        const descInput = screen.getByPlaceholderText('selectfoods.humandesc');

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

        fireEvent.click(screen.getByText('start'));

        const passedCharacters = mockOnContinue.mock.calls[0][0].characters;

        expect(passedCharacters.length).toBeLessThanOrEqual(7);
        expect(passedCharacters.map((character) => character.name)).not.toContain(overflowParticipant.name);
    });

    it('should deselect a food when clicked again', () => {
        render(<ControlledSelectCharacters />);

        const participantBtn = screen.getByAltText(firstParticipant.name);

        fireEvent.click(participantBtn);
        fireEvent.click(participantBtn);

        expect(screen.queryByText('start')).not.toBeInTheDocument();
    });

    it('should show error when human panelists have duplicate names', async () => {
        render(<ControlledSelectCharacters />);

        selectMinimumParticipants();

        const addBtn = screen.getByAltText('add human');
        fireEvent.click(addBtn);

        let nameInput = screen.getByPlaceholderText('selectfoods.humanname');
        let descInput = screen.getByPlaceholderText('selectfoods.humandesc');
        fireEvent.change(nameInput, { target: { value: 'Bob' } });
        fireEvent.change(descInput, { target: { value: 'Desc 1' } });

        fireEvent.click(addBtn);

        nameInput = screen.getByPlaceholderText('selectfoods.humanname');
        descInput = screen.getByPlaceholderText('selectfoods.humandesc');
        fireEvent.change(nameInput, { target: { value: 'Bob' } });
        fireEvent.change(descInput, { target: { value: 'Desc 2' } });

        expect(await screen.findByText('selectfoods.unique')).toBeInTheDocument();
        expect(screen.queryByText('start')).not.toBeInTheDocument();
    });
});
