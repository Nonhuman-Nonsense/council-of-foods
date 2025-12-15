
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
    });
});
