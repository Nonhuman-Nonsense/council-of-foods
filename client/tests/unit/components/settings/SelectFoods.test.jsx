
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

        // Real file default chair is River
        const riverBtn = screen.getByAltText('River');
        expect(riverBtn).toBeInTheDocument();
    });

    it('should enforce min participants (2) before allowing Start', () => {
        render(<SelectFoods lang="en" topicTitle="Test Topic" onContinueForward={mockOnContinue} />);

        expect(screen.queryByText('start')).not.toBeInTheDocument();
        expect(screen.getByText('selectfoods.pleaseselect')).toBeInTheDocument();

        // Select Salmon
        const salmonBtn = screen.getByAltText('Salmon');
        fireEvent.click(salmonBtn);

        // Still not enough (2 < 3)
        expect(screen.queryByText('start')).not.toBeInTheDocument();

        // Select Pine
        fireEvent.click(screen.getByAltText('Pine'));

        // Now we have 3 (River, Salmon, Pine). Expect Start button
        const startBtn = screen.getByText('start');
        expect(startBtn).toBeInTheDocument();
    });

    it('should construct the prompt correctly with participants', () => {
        render(<SelectFoods lang="en" topicTitle="Test Topic" onContinueForward={mockOnContinue} />);

        // Select Salmon and Pine
        fireEvent.click(screen.getByAltText('Salmon'));
        fireEvent.click(screen.getByAltText('Pine'));

        // Click Start
        fireEvent.click(screen.getByText('start'));

        // Verify onContinueForward called
        expect(mockOnContinue).toHaveBeenCalledTimes(1);
        const calledArg = mockOnContinue.mock.calls[0][0];

        const passedFoods = calledArg.foods;
        expect(passedFoods).toHaveLength(3); // River, Salmon, Pine

        // Check Chair's prompt injection
        // Using real text from foods_en.json: "Todays participants are: [FOODS].[HUMANS]"
        // Expected replacement: "Todays participants are: Salmon, Pine."

        expect(passedFoods[0].prompt).toContain("Todays participants are: Salmon, Pine.");
    });

    it('should handle Human Panelists injection into prompt', async () => {
        render(<SelectFoods lang="en" topicTitle="Test Topic" onContinueForward={mockOnContinue} />);

        // Select Salmon AND Pine to meet min requirements (3 foods)
        fireEvent.click(screen.getByAltText('Salmon'));
        fireEvent.click(screen.getByAltText('Pine'));

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

        // Verify that the Human Panelist has a voice assigned (Chair's voice)
        // Find the human object in the passed array
        const humanPanelist = passedFoods.find(f => f.id.startsWith("panelist"));
        expect(humanPanelist).toBeDefined();
        // Since default chair is Water, voice should be 'alloy' (from foods_en.json)
        expect(humanPanelist.voice).toBe('alloy');
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

    it('should prevent selecting more than max participants (6)', () => {
        render(<SelectFoods lang="en" topicTitle="Test Topic" onContinueForward={mockOnContinue} />);

        // Select 6 items (Chair + 5 others) to reach max (6 + 1 chair = 7)

        // Chair (River) is already selected.
        // We select 6 more: Salmon, Lichen, Pine, Reindeer, Tree Harvester, Bumblebee.
        // Total = 7.
        const foods = ['Salmon', 'Lichen', 'Pine', 'Reindeer', 'Tree Harvester', 'Bumblebee'];

        foods.forEach(food => {
            const btn = screen.getByAltText(food);
            fireEvent.click(btn);
        });

        // Try to select one more (e.g. Wind Turbine)
        const extraBtn = screen.getByAltText('Wind Turbine');
        fireEvent.click(extraBtn);

        const startBtn = screen.getByText('start');
        fireEvent.click(startBtn);

        const passedFoods = mockOnContinue.mock.calls[0][0].foods;

        expect(passedFoods.length).toBeLessThanOrEqual(7);
        expect(passedFoods.map(f => f.name)).not.toContain('Wind Turbine');
    });

    it('should deselect a food when clicked again', () => {
        render(<SelectFoods lang="en" topicTitle="Test Topic" onContinueForward={mockOnContinue} />);

        const salmonBtn = screen.getByAltText('Salmon');

        // Select
        fireEvent.click(salmonBtn);
        // Check if selected (we can assume it is if we can deselect it)

        // Deselect
        fireEvent.click(salmonBtn);

        // We can't easily check internal state, but we can check if Start button is hidden (since only Chair is left = 1 food, need 2)
        expect(screen.queryByText('start')).not.toBeInTheDocument();
    });

    it('should show error when human panelists have duplicate names', async () => {
        render(<SelectFoods lang="en" topicTitle="Test Topic" onContinueForward={mockOnContinue} />);

        // Select Salmon and Pine to satisfy atLeastTwoFoods requirement
        fireEvent.click(screen.getByAltText('Salmon'));
        fireEvent.click(screen.getByAltText('Pine'));

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

        // Wait for the form to switch to the new human (who has empty name)
        let nameInput2;
        await waitFor(() => {
            nameInput2 = screen.getByPlaceholderText('selectfoods.humanname');
            // We expect the new human's name to be empty (or blank)
            expect(nameInput2.value).toBe('');
        });

        // Re-query to be safe/clean
        nameInput = screen.getByPlaceholderText('selectfoods.humanname');
        descInput = screen.getByPlaceholderText('selectfoods.humandesc');

        // Now we edit Human 2
        fireEvent.change(nameInput, { target: { value: 'Bob' } });
        fireEvent.change(descInput, { target: { value: 'Desc 2' } });

        // Now we have two Bobs.
        // We need to look for the global error message.
        expect(await screen.findByText('selectfoods.unique')).toBeInTheDocument();

        // Start button should be hidden
        expect(screen.queryByText('start')).not.toBeInTheDocument();
    });
});
