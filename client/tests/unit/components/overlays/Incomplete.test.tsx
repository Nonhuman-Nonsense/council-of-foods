import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Incomplete from '@components/overlays/Incomplete';
import '@testing-library/jest-dom';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        // Echo the key so assertions stay grounded in the hook contract
        // rather than copy-of-English strings that may drift.
        t: (key: string) => key,
    }),
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
        fireEvent.click(screen.getByText('incomplete.3'));
        expect(defaultProps.onAttemptResume).toHaveBeenCalledTimes(1);
    });

    it('invokes onNevermind when the nevermind button is clicked', () => {
        render(<Incomplete {...defaultProps} />);
        fireEvent.click(screen.getByText('completed.4'));
        expect(defaultProps.onNevermind).toHaveBeenCalledTimes(1);
    });
});
