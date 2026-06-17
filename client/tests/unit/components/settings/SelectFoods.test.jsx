
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SelectCharacters from '@newMeeting/SelectCharacters';
import { characterSetupEn } from '../../../characterSetupTestData';
import { useMeetingSetupStore } from '@stores/useMeetingSetupStore';

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
// Uses the real default character setup bundle through the shared test loader.

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

        // Real file default chair is Water
        const waterBtn = screen.getByAltText('Water');
        expect(waterBtn).toBeInTheDocument();
    });

    it('should enforce min participants (2) before allowing Start', () => {
        render(<ControlledSelectCharacters />);

        expect(screen.queryByText('start')).not.toBeInTheDocument();
        expect(screen.getByText('selectfoods.pleaseselect')).toBeInTheDocument();

        // Select Tomato
        const tomatoBtn = screen.getByAltText('Tomato');
        fireEvent.click(tomatoBtn);

        // Still not enough (2 < 3)
        expect(screen.queryByText('start')).not.toBeInTheDocument();

        // Select Potato
        fireEvent.click(screen.getByAltText('Potato'));

        // Now we have 3 (Water, Tomato, Potato). Expect Start button
        const startBtn = screen.getByText('start');
        expect(startBtn).toBeInTheDocument();
    });

    it('should pass selected characters to onContinueForward', () => {
        render(<ControlledSelectCharacters />);

        // Select Tomato and Potato
        fireEvent.click(screen.getByAltText('Tomato'));
        fireEvent.click(screen.getByAltText('Potato'));

        // Click Start
        fireEvent.click(screen.getByText('start'));

        // Verify onContinueForward called
        expect(mockOnContinue).toHaveBeenCalledTimes(1);
        const passedCharacters = mockOnContinue.mock.calls[0][0].characters;

        expect(passedCharacters).toHaveLength(3); // Water, Tomato, Potato
        expect(passedCharacters.map((character) => character.id)).toEqual([
            characterSetupEn.characters[0].id,
            'tomato',
            'potato',
        ]);
        expect(passedCharacters.map((character) => character.name)).toEqual([
            'Water',
            'Tomato',
            'Potato',
        ]);
    });

    it('should handle Human Panelists injection into prompt', async () => {
        render(<ControlledSelectCharacters />);

        // Select Tomato AND Potato to meet min requirements (3 foods)
        fireEvent.click(screen.getByAltText('Tomato'));
        fireEvent.click(screen.getByAltText('Potato'));

        // Add Human
        const addBtn = screen.getByAltText('add human');
        fireEvent.click(addBtn);

        const nameInput = screen.getByPlaceholderText('selectfoods.humanname');
        const descInput = screen.getByPlaceholderText('selectfoods.humandesc');

        fireEvent.change(nameInput, { target: { value: 'Alice' } });
        fireEvent.change(descInput, { target: { value: 'A thoughtful human' } });

        // Check Start button
        const startBtn = await screen.findByText('start');
        fireEvent.click(startBtn);

        const passedCharacters = mockOnContinue.mock.calls[0][0].characters;
        const humanPanelist = passedCharacters.find((character) => character.id.startsWith("panelist"));

        expect(passedCharacters.map((character) => character.id)).toEqual([
            characterSetupEn.characters[0].id,
            'tomato',
            'potato',
            'panelist0',
        ]);
        expect(humanPanelist).toEqual(expect.objectContaining({
            name: 'Alice',
            description: 'A thoughtful human',
        }));

        // Verify that the Human Panelist has a voice assigned (Chair's voice)
        expect(humanPanelist.voice).toBe(characterSetupEn.characters[0].voice);
        expect(humanPanelist.voiceProvider).toBe(characterSetupEn.characters[0].voiceProvider);
        expect(humanPanelist.voiceTemperature).toBe(characterSetupEn.characters[0].voiceTemperature);
        expect(humanPanelist.voiceInstruction).toBe(characterSetupEn.characters[0].voiceInstruction);
        expect(humanPanelist.voiceLocale).toBe(characterSetupEn.characters[0].voiceLocale);
    });

    it('should maintain focus on description when typing', async () => {
        render(<ControlledSelectCharacters />);

        // Add Human
        const addBtn = screen.getByAltText('add human');
        fireEvent.click(addBtn);

        const nameInput = screen.getByPlaceholderText('selectfoods.humanname');
        const descInput = screen.getByPlaceholderText('selectfoods.humandesc');

        // Focus name (default behavior)
        expect(document.activeElement).toBe(nameInput);

        // Switch focus to description
        descInput.focus();
        expect(document.activeElement).toBe(descInput);

        // Type in description - this updates state and re-renders
        fireEvent.change(descInput, { target: { value: 'A' } });

        // If bug exists, focus jumps back to nameInput
        expect(document.activeElement).toBe(descInput);
    });

    it('should prevent selecting more than max participants (6)', () => {
        render(<ControlledSelectCharacters />);

        // Select 6 items (Chair + 5 others) to reach max (6 + 1 chair = 7)

        // Chair (Water) is already selected.
        // We select 6 more: Tomato, Potato, Mushroom, Maize, Avocado, Banana.
        // Total = 7.
        const foods = ['Tomato', 'Potato', 'Mushroom', 'Maize', 'Avocado', 'Banana'];

        foods.forEach(food => {
            const btn = screen.getByAltText(food);
            fireEvent.click(btn);
        });

        // Try to select one more (e.g. Bean)
        const extraBtn = screen.getByAltText('Bean');
        fireEvent.click(extraBtn);

        const startBtn = screen.getByText('start');
        fireEvent.click(startBtn);

        const passedCharacters = mockOnContinue.mock.calls[0][0].characters;
        // Should only be 7 items (Water + 6 selected) ??
        // Wait, maxFoods = 7.
        // If I selected 6 others + Water = 7.
        // If I click Bean, it checks < 7. 7 < 7 is false.
        // So Bean is NOT selected.

        expect(passedCharacters.length).toBeLessThanOrEqual(7);
        expect(passedCharacters.map(f => f.name)).not.toContain('Bean');
    });

    it('should deselect a food when clicked again', () => {
        render(<ControlledSelectCharacters />);

        const tomatoBtn = screen.getByAltText('Tomato');

        // Select
        fireEvent.click(tomatoBtn);
        // Check if selected (we can assume it is if we can deselect it)

        // Deselect
        fireEvent.click(tomatoBtn);

        // We can't easily check internal state, but we can check if Start button is hidden (since only Chair is left = 1 food, need 2)
        expect(screen.queryByText('start')).not.toBeInTheDocument();
    });

    it('should show error when human panelists have duplicate names', async () => {
        render(<ControlledSelectCharacters />);

        // Select Tomato and Potato to satisfy atLeastTwoFoods requirement
        fireEvent.click(screen.getByAltText('Tomato'));
        fireEvent.click(screen.getByAltText('Potato'));

        // Add Human 1
        const addBtn = screen.getByAltText('add human');
        fireEvent.click(addBtn);

        // Edit Human 1
        let nameInput = screen.getByPlaceholderText('selectfoods.humanname');
        let descInput = screen.getByPlaceholderText('selectfoods.humandesc');
        fireEvent.change(nameInput, { target: { value: 'Bob' } });
        fireEvent.change(descInput, { target: { value: 'Desc 1' } });

        // Add Human 2 (this should auto-select Human 2)
        fireEvent.click(addBtn);

        // Edit Human 2
        nameInput = screen.getByPlaceholderText('selectfoods.humanname');
        descInput = screen.getByPlaceholderText('selectfoods.humandesc');
        // Ensure input is empty or fresh (though we just added it)
        fireEvent.change(nameInput, { target: { value: 'Bob' } });
        fireEvent.change(descInput, { target: { value: 'Desc 2' } });

        // Now we have two Bobs.
        // We need to look for the global error message, not inside the form.
        expect(await screen.findByText('selectfoods.unique')).toBeInTheDocument();

        // Start button should be hidden
        expect(screen.queryByText('start')).not.toBeInTheDocument();
    });
});
