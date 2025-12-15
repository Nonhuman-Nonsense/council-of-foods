
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
    { id: 'topic2', title: 'Topic Two', description: 'Desc Two' },
    { id: 'custom', title: 'Write your own', description: 'Custom' }
];

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
        // Implementation note: The component expects the last topic to be the "Custom" placeholder.
        // mockTopics already includes this as per previous fix.

        render(
            <SelectTopic
                topics={mockTopics}
                onContinueForward={mockOnContinue}
                onReset={mockOnReset}
                onCancel={mockOnCancel}
                currentTopic={null}
            />
        );

        // Click "Write your own" (last item)
        fireEvent.click(screen.getByText('Write your own'));

        // Textarea should appear
        const textarea = screen.getByPlaceholderText('writetopic');
        expect(textarea).toBeVisible();

        // Type in generic bad words... I mean, valid topic
        fireEvent.change(textarea, { target: { value: 'My Custom Topic' } });

        // Click Next
        fireEvent.click(screen.getByText('next'));

        expect(mockOnContinue).toHaveBeenCalledWith({ topic: 'customtopic', custom: 'My Custom Topic' });
    });

    it('should show reset warning if currentTopic is set (changing mid-meeting)', () => {
        const currentTopic = { id: 'topic1', prompt: 'OLD PROMPT' };

        render(
            <SelectTopic
                topics={mockTopics}
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
});
