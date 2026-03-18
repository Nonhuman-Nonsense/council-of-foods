import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Name from '../../../../src/components/overlays/Name';
import React from 'react';

// Mock dependencies
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key) => key,
    }),
}));

// Mock utils - defaulting to desktop (false)
const mockUseMobile = vi.fn();
vi.mock('../../../../src/utils', () => ({
    useMobile: () => mockUseMobile(),
    capitalizeFirstLetter: (str) => str.charAt(0).toUpperCase() + str.slice(1)
}));

describe('Name Overlay', () => {
    const mockOnContinueForward = vi.fn();
    const mockParticipants = [
        { name: 'Banana' },
        { name: 'Apple' }
    ];

    beforeEach(() => {
        vi.clearAllMocks();
        mockUseMobile.mockReturnValue(false); // Default to desktop
    });

    it('renders correctly', () => {
        render(<Name participants={mockParticipants} onContinueForward={mockOnContinueForward} />);

        expect(screen.getByText('name.title')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('name.5')).toBeInTheDocument();
        // Check initial focus for desktop
        const input = screen.getByPlaceholderText('name.5');
        expect(input).toHaveFocus();
    });

    it('does not auto-focus on mobile', () => {
        mockUseMobile.mockReturnValue(true);
        render(<Name participants={mockParticipants} onContinueForward={mockOnContinueForward} />);

        const input = screen.getByPlaceholderText('name.5');
        expect(input).not.toHaveFocus();
    });

    it('validates empty input', () => {
        render(<Name participants={mockParticipants} onContinueForward={mockOnContinueForward} />);

        const nextButton = screen.getByLabelText('continue');
        fireEvent.click(nextButton);

        // Should show error (visiblity check)
        // The component logic sets isHumanNameMissing=true
        // The error message translates to 'name.4'
        expect(screen.getByText('name.4')).toBeVisible();
        expect(mockOnContinueForward).not.toHaveBeenCalled();
    });

    it('validates duplicate name', () => {
        render(<Name participants={mockParticipants} onContinueForward={mockOnContinueForward} />);

        const input = screen.getByPlaceholderText('name.5');
        fireEvent.change(input, { target: { value: 'Banana' } });

        const nextButton = screen.getByLabelText('continue');
        fireEvent.click(nextButton);

        // Should show duplicate error ('name.unique')
        expect(screen.getByText('name.unique')).toBeVisible();
        expect(mockOnContinueForward).not.toHaveBeenCalled();
    });

    it('submits valid name', () => {
        render(<Name participants={mockParticipants} onContinueForward={mockOnContinueForward} />);

        const input = screen.getByPlaceholderText('name.5');
        fireEvent.change(input, { target: { value: 'Cherry' } });

        const nextButton = screen.getByLabelText('continue');
        fireEvent.click(nextButton);

        expect(mockOnContinueForward).toHaveBeenCalledWith({ humanName: 'Cherry' });
    });

    it('submits on Enter key', () => {
        render(<Name participants={mockParticipants} onContinueForward={mockOnContinueForward} />);

        const input = screen.getByPlaceholderText('name.5');
        fireEvent.change(input, { target: { value: 'Date' } });
        fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });

        expect(mockOnContinueForward).toHaveBeenCalledWith({ humanName: 'Date' });
    });

    it('capitalizes first letter', () => {
        render(<Name participants={mockParticipants} onContinueForward={mockOnContinueForward} />);

        const input = screen.getByPlaceholderText('name.5');
        // Simulate typing lowercase
        fireEvent.change(input, { target: { value: 'elderberry' } });

        // Component state should update to capitalized
        expect(input.value).toBe('Elderberry');
    });
});
