import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Landing from '@components/settings/Landing';
import React from 'react';

// Mock dependencies
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('react-responsive', () => ({
    useMediaQuery: vi.fn(),
}));

vi.mock('@/utils', () => ({
    useMobile: vi.fn(),
    dvh: 'vh',
}));

vi.mock('@components/RotateDevice', () => ({
    default: () => <div data-testid="rotate-device">Rotate Device</div>,
}));

import { useMediaQuery } from 'react-responsive';
import { useMobile } from '@/utils';

describe('Landing', () => {
    const onContinueForward = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        // Default to landscape (not portrait) and not mobile for base case
        (useMediaQuery as any).mockReturnValue(false); // isPortrait = false
        (useMobile as any).mockReturnValue(false);
    });

    afterEach(() => {
        cleanup();
    });

    it('renders welcome message', () => {
        render(<Landing onContinueForward={onContinueForward} />);
        expect(screen.getByText('welcome')).toBeInTheDocument();
        expect(screen.getByText('COUNCIL')).toBeInTheDocument();
    });

    it('renders "Go" button in landscape mode', () => {
        (useMediaQuery as any).mockReturnValue(false); // Portrait false
        render(<Landing onContinueForward={onContinueForward} />);
        expect(screen.getByText('go')).toBeInTheDocument();
        expect(screen.getByText('description')).toBeInTheDocument();
        expect(screen.queryByTestId('rotate-device')).not.toBeInTheDocument();
    });

    it('renders RotateDevice in portrait mode', () => {
        (useMediaQuery as any).mockReturnValue(true); // Portrait true
        render(<Landing onContinueForward={onContinueForward} />);
        expect(screen.getByTestId('rotate-device')).toBeInTheDocument();
        expect(screen.queryByText('go')).not.toBeInTheDocument();
    });

    it('calls onContinueForward when Go button is clicked', () => {
        render(<Landing onContinueForward={onContinueForward} />);
        const button = screen.getByText('go');
        fireEvent.click(button);
        expect(onContinueForward).toHaveBeenCalledTimes(1);
    });
});
