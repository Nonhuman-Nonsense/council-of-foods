import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MeetingElsewhere from '@council/overlays/MeetingElsewhere';
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

describe('MeetingElsewhere overlay', () => {
    const defaultProps = {
        onGoBack: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('invokes onGoBack when the go back button is clicked', () => {
        render(<MeetingElsewhere {...defaultProps} />);
        fireEvent.click(screen.getByText('meetingElsewhere.goBack'));
        expect(defaultProps.onGoBack).toHaveBeenCalledTimes(1);
    });

    it('navigates to root when the start new meeting button is clicked', () => {
        render(<MeetingElsewhere {...defaultProps} />);
        fireEvent.click(screen.getByText('meetingElsewhere.startNew'));
        expect(mockNavigate).toHaveBeenCalledWith('/');
    });
});
