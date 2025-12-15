
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SelectFoods from '../../../../src/components/settings/SelectFoods';

// Mock dependencies
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key) => key }),
}));

vi.mock('../../../../src/utils', () => ({
    useMobile: () => false,
    useMobileXs: () => false,
    toTitleCase: (str) => str,
    filename: (str) => str
}));
// Removed mock for foods_en.json to use the real file

describe('SelectFoods Component', () => {
    let mockOnContinue;

    beforeEach(() => {
        mockOnContinue = vi.fn();
    });

    it('should render correctly with default chair selected', () => {
        render(<SelectFoods lang="en" topicTitle="Test Topic" onContinueForward={mockOnContinue} />);

        // Real file default chair is Water
        const waterBtn = screen.getByAltText('Water');
        expect(waterBtn).toBeInTheDocument();
    });

    it('should enforce min participants (2) before allowing Start', () => {
        render(<SelectFoods lang="en" topicTitle="Test Topic" onContinueForward={mockOnContinue} />);

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

    it('should construct the prompt correctly with participants', () => {
        render(<SelectFoods lang="en" topicTitle="Test Topic" onContinueForward={mockOnContinue} />);

        // Select Tomato and Potato
        fireEvent.click(screen.getByAltText('Tomato'));
        fireEvent.click(screen.getByAltText('Potato'));

        // Click Start
        fireEvent.click(screen.getByText('start'));

        // Verify onContinueForward called
        expect(mockOnContinue).toHaveBeenCalledTimes(1);
        const calledArg = mockOnContinue.mock.calls[0][0];

        const passedFoods = calledArg.foods;
        expect(passedFoods).toHaveLength(3); // Water, Tomato, Potato

        // Check Chair's prompt injection
        // Using real text from foods_en.json: "Todays participants are: [FOODS].[HUMANS]"
        // Expected replacement: "Todays participants are: Tomato, Potato."

        expect(passedFoods[0].prompt).toContain("Todays participants are: Tomato, Potato.");
    });

    it('should handle Human Panelists injection into prompt', async () => {
        render(<SelectFoods lang="en" topicTitle="Test Topic" onContinueForward={mockOnContinue} />);

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

        const passedFoods = mockOnContinue.mock.calls[0][0].foods;
        const chair = passedFoods[0];

        // Verify [HUMANS] replacement
        // Using real text for panelWithHumans: " As a special for today, on the panel are also [HUMANS]. Welcome them especially! "
        // Logic: "selectfoods.human" + "Alice, A thoughtful human"

        expect(chair.prompt).toContain("on the panel are also selectfoods.humanAlice, A thoughtful human.");
    });

    it('should maintain focus on description when typing', async () => {
        render(<SelectFoods lang="en" topicTitle="Test Topic" onContinueForward={mockOnContinue} />);

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
});
