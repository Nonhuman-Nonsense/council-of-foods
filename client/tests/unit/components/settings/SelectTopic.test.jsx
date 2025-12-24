
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import SelectTopic from '../../../../src/components/settings/SelectTopic';

// Mocks
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key) => key }),
}));

vi.mock('../../../../src/utils', () => ({
    useMobile: () => false,
    useMobileXs: () => false,
    toTitleCase: (str) => str,
    capitalizeFirstLetter: (str) => str
}));

vi.mock('../../../../src/components/overlays/ResetWarning', () => ({
    default: ({ onReset, onCancel }) => (
        <div data-testid="reset-warning">
            <button onClick={onReset}>Confirm Reset</button>
            <button onClick={onCancel}>Cancel</button>
        </div>
    )
}));

const mockTopics = [
    { id: 'topic1', title: 'Topic One', description: 'Desc One' },
    { id: 'topic2', title: 'Topic Two', description: 'Desc Two' }
];

const mockCustomTopicConfig = { id: 'customtopic', title: 'Write your own', description: 'Custom' };

describe('SelectTopic Component', () => {
    let mockOnContinue;
    let mockOnReset;
    let mockOnCancel;

    beforeEach(() => {
        mockOnContinue = vi.fn();
        mockOnReset = vi.fn();
        mockOnCancel = vi.fn();
    });

    it('should render topics and allow selection', () => {
        render(
            <SelectTopic
                topics={mockTopics}
                customTopicConfig={mockCustomTopicConfig}
                onContinueForward={mockOnContinue}
                onReset={mockOnReset}
                onCancel={mockOnCancel}
                currentTopic={null}
            />
        );

        // Check topics rendered
        expect(screen.getByText('Topic One')).toBeInTheDocument();
        expect(screen.getByText('Topic Two')).toBeInTheDocument();

        // Select Topic One
        const btn = screen.getByText('Topic One');
        fireEvent.click(btn);

        // Check Next button appears
        const nextBtn = screen.getByText('next');
        expect(nextBtn).toBeVisible();

        // Click Next
        fireEvent.click(nextBtn);

        expect(mockOnContinue).toHaveBeenCalledWith({ topic: 'topic1', custom: '' });
    });

    it('should allow custom topic entry', () => {
        render(
            <SelectTopic
                topics={mockTopics}
                customTopicConfig={mockCustomTopicConfig}
                onContinueForward={mockOnContinue}
                onReset={mockOnReset}
                onCancel={mockOnCancel}
                currentTopic={null}
            />
        );

        // Click "Write your own" (last item)
        fireEvent.click(screen.getByText('Write your own'));

        // Check that textarea exists and has correct class for strict font styling
        const textarea = screen.getByPlaceholderText('writetopic');
        expect(textarea).toBeInTheDocument();
        expect(textarea).toHaveClass('topic-textarea');

        // Simulate typing
        fireEvent.change(textarea, { target: { value: 'My Custom Topic' } });
        expect(textarea).toHaveValue('My Custom Topic');

        // Click Next
        fireEvent.click(screen.getByText('next'));

        expect(mockOnContinue).toHaveBeenCalledWith({ topic: 'customtopic', custom: 'My Custom Topic' });
    });

    it('should use single-column layout for few topics (<=6)', () => {
        // Create 4 topics (plus custom)
        const fewTopics = [
            { id: '1', title: 'T1', description: 'A' },
            { id: '2', title: 'T2', description: 'B' },
            { id: '3', title: 'T3', description: 'C' },
            { id: '4', title: 'T4', description: 'D' }
        ];

        render(
            <SelectTopic
                topics={fewTopics}
                customTopicConfig={mockCustomTopicConfig}
                onContinueForward={mockOnContinue}
                onReset={mockOnReset}
                onCancel={mockOnCancel}
                currentTopic={null}
            />
        );

        // Find the grid container. Since we don't have a test id on the container,
        // we can look for the parent of one of the buttons.
        const btn = screen.getByText('T1');
        const gridContainer = btn.parentElement;

        // Assert grid column logic
        expect(gridContainer).toHaveStyle('grid-template-columns: 1fr');
        // Assert button width constraint (checking style directly on element is tricky if inline, but let's try)
        // With react testing library, toHaveStyle checks computed style or inline style.
        // We set inline style width: 50%
        expect(btn).toHaveStyle('width: 50%');
    });

    it('should use two-column layout for many topics (>6)', () => {
        // Create 7 topics (plus custom)
        const manyTopics = Array.from({ length: 7 }, (_, i) => ({
            id: `topic${i}`, title: `Topic ${i}`, description: `Desc ${i}`
        }));

        render(
            <SelectTopic
                topics={manyTopics}
                customTopicConfig={mockCustomTopicConfig}
                onContinueForward={mockOnContinue}
                onReset={mockOnReset}
                onCancel={mockOnCancel}
                currentTopic={null}
            />
        );

        const btn = screen.getByText('Topic 0');
        const gridContainer = btn.parentElement;
        const customBtn = screen.getByText('Write your own');

        expect(gridContainer).toHaveStyle('grid-template-columns: 1fr 1fr');

        // Custom button should stride/span 2 columns and be 50% width
        expect(customBtn).toHaveStyle('grid-column: 1 / -1');
        expect(customBtn).toHaveStyle('width: 50%');

        // Standard buttons should be ~full width of their cell (or not restricted to 50%)
        // We removed width: 100% from selectButtonStyle for double column (it defaults to auto/full).
        // Let's verify it does NOT have 50% width.
        expect(btn).not.toHaveStyle('width: 50%');
    });

    it('should show reset warning if currentTopic is set (changing mid-meeting)', () => {
        const currentTopic = { id: 'topic1', prompt: 'OLD PROMPT' };

        render(
            <SelectTopic
                topics={mockTopics}
                customTopicConfig={mockCustomTopicConfig}
                onContinueForward={mockOnContinue}
                onReset={mockOnReset}
                onCancel={mockOnCancel}
                currentTopic={currentTopic}
            />
        );

        // Should auto-select topic1 (useEffect)
        // Check Next button is visible
        const nextBtn = screen.getByText('next');
        expect(nextBtn).toBeVisible();

        // Change selection to Topic Two
        fireEvent.click(screen.getByText('Topic Two'));

        // Click Next
        fireEvent.click(nextBtn);

        // Should NOT call onContinue, but show Warning
        expect(mockOnContinue).not.toHaveBeenCalled();
        expect(screen.getByTestId('reset-warning')).toBeInTheDocument();

        // Confirm Reset
        fireEvent.click(screen.getByText('Confirm Reset'));
        expect(mockOnReset).toHaveBeenCalledWith({ topic: 'topic2', custom: '' });
    });

    it('updates tooltip text based on hover and selection priority', () => {
        render(
            <SelectTopic
                topics={mockTopics}
                customTopicConfig={mockCustomTopicConfig}
                onContinueForward={mockOnContinue}
                onReset={mockOnReset}
                onCancel={mockOnCancel}
                currentTopic={null}
            />
        );

        // Default: "The Issue" instruction (mocked as key 'selectissue')
        expect(screen.getByText('selectissue')).toBeInTheDocument();

        // Hover Topic One -> Shows "Desc One"
        fireEvent.mouseEnter(screen.getByText('Topic One'));
        expect(screen.getByText('Desc One')).toBeInTheDocument();

        // Leave -> Returns to Default
        fireEvent.mouseLeave(screen.getByText('Topic One'));
        expect(screen.getByText('selectissue')).toBeInTheDocument();

        // Select Topic Two -> Shows "Desc Two"
        fireEvent.click(screen.getByText('Topic Two'));
        expect(screen.getByText('Desc Two')).toBeInTheDocument();

        // Hover Topic One WHILE Topic Two is selected -> Shows "Desc One" (Hover > Selected)
        fireEvent.mouseEnter(screen.getByText('Topic One'));
        expect(screen.getByText('Desc One')).toBeInTheDocument();

        // Leave -> Returns to "Desc Two" (Selected)
        fireEvent.mouseLeave(screen.getByText('Topic One'));
        expect(screen.getByText('Desc Two')).toBeInTheDocument();
    });

    it('hides/shows Next button based on validation', () => {
        render(
            <SelectTopic
                topics={mockTopics}
                customTopicConfig={mockCustomTopicConfig}
                onContinueForward={mockOnContinue}
                onReset={mockOnReset}
                onCancel={mockOnCancel}
                currentTopic={null}
            />
        );

        const nextBtn = screen.getByText('next');

        // Initially hidden (no selection)
        expect(nextBtn).not.toBeVisible();

        // Select normal topic -> Visible
        fireEvent.click(screen.getByText('Topic One'));
        expect(nextBtn).toBeVisible();

        // Select custom topic -> Hidden (textarea empty)
        fireEvent.click(screen.getByText('Write your own'));
        expect(nextBtn).not.toBeVisible();

        // Type in custom topic -> Visible
        const textarea = screen.getByPlaceholderText('writetopic');
        fireEvent.change(textarea, { target: { value: 'Something' } });
        expect(nextBtn).toBeVisible();

        // Clear custom topic -> Hidden
        fireEvent.change(textarea, { target: { value: '   ' } });
        expect(nextBtn).not.toBeVisible();
    });

    it('shows custom text box when hovering custom topic button', () => {
        render(
            <SelectTopic
                topics={mockTopics}
                customTopicConfig={mockCustomTopicConfig}
                onContinueForward={mockOnContinue}
                onReset={mockOnReset}
                onCancel={mockOnCancel}
                currentTopic={null}
            />
        );

        const textarea = screen.getByPlaceholderText('writetopic');
        const customBtn = screen.getByText('Write your own');

        // Initially hidden
        expect(textarea).not.toBeVisible();

        // Hover Custom -> Visible
        fireEvent.mouseEnter(customBtn);
        // Note: component uses `display: none` for hidden style. 
        // `toBeVisible` checks visibility.
        expect(textarea).toBeVisible();

        // Leave Custom -> Hidden
        fireEvent.mouseLeave(customBtn);
        expect(textarea).not.toBeVisible();
    });
});
