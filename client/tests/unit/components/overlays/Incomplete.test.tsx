import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Incomplete from '@council/overlays/Incomplete';
import '@testing-library/jest-dom';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        // Echo the key so assertions stay grounded in the hook contract
        // rather than copy-of-English strings that may drift.
        t: (key: string) => key,
    }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router', () => ({
    useNavigate: () => mockNavigate,
}));

vi.mock('@/navigation', () => ({
    useRouting: () => ({ rootPath: '/' }),
}));

describe('Incomplete overlay', () => {
    const defaultProps = {
        onAttemptResume: vi.fn(),
        onNevermind: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('invokes onAttemptResume when the resume button is clicked', () => {
        render(<Incomplete {...defaultProps} />);
        fireEvent.click(screen.getByText('incomplete.resume'));
        expect(defaultProps.onAttemptResume).toHaveBeenCalledTimes(1);
    });

    it('invokes onNevermind when the nevermind button is clicked', () => {
        render(<Incomplete {...defaultProps} />);
        fireEvent.click(screen.getByText('incomplete.nevermind'));
        expect(defaultProps.onNevermind).toHaveBeenCalledTimes(1);
    });

    describe('when elsewhere is set (another live session holds the meeting)', () => {
        it('invokes onNevermind (go back) when the go back button is clicked', () => {
            render(<Incomplete {...defaultProps} elsewhere />);
            fireEvent.click(screen.getByText('meetingElsewhere.goBack'));
            expect(defaultProps.onNevermind).toHaveBeenCalledTimes(1);
        });

        it('navigates to root when the start new meeting button is clicked', () => {
            render(<Incomplete {...defaultProps} elsewhere />);
            fireEvent.click(screen.getByText('meetingElsewhere.startNew'));
            expect(mockNavigate).toHaveBeenCalledWith('/');
        });

        it('does not render the resume button', () => {
            render(<Incomplete {...defaultProps} elsewhere />);
            expect(screen.queryByText('incomplete.resume')).not.toBeInTheDocument();
        });
    });
});
