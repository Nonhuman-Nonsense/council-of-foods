import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Landing from '@newMeeting/Landing';
import { MemoryRouter } from 'react-router';

// Mock dependencies
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('@/routing', () => ({
    useRouting: () => ({
        newMeetingPath: '/en/new',
    }),
}));

vi.mock('react-responsive', () => ({
    useMediaQuery: vi.fn(),
}));

vi.mock('@/utils', () => ({
    useMobile: vi.fn(),
    dvh: 'vh',
}));

vi.mock('@main/overlay/RotateDevice', () => ({
    default: () => <div data-testid="rotate-device">Rotate Device</div>,
}));

vi.mock('@/museum/useAppMode', () => ({
    useAppMode: vi.fn(() => ({ isMuseumMode: false })),
}));

import { useMediaQuery } from 'react-responsive';
import { useMobile } from '@/utils';
import { useAppMode } from '@/museum/useAppMode';

describe('Landing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default to landscape (not portrait) and not mobile for base case
        (useMediaQuery as ReturnType<typeof vi.fn>).mockReturnValue(false); // isPortrait = false
        (useMobile as ReturnType<typeof vi.fn>).mockReturnValue(false);
        vi.mocked(useAppMode).mockReturnValue({
            mode: 'web',
            isMuseumMode: false,
            setAppMode: vi.fn(),
        });
    });

    afterEach(() => {
        cleanup();
    });

    it('renders welcome message', () => {
        render(
            <MemoryRouter>
                <Landing />
            </MemoryRouter>
        );
        expect(screen.getByText('welcome')).toBeInTheDocument();
        expect(screen.getByText('COUNCIL')).toBeInTheDocument();
    });

    it('renders "Go" button in landscape mode', () => {
        (useMediaQuery as ReturnType<typeof vi.fn>).mockReturnValue(false); // Portrait false
        render(
            <MemoryRouter>
                <Landing />
            </MemoryRouter>
        );
        expect(screen.getByText('go')).toBeInTheDocument();
        expect(screen.getByText('description')).toBeInTheDocument();
        expect(screen.queryByTestId('rotate-device')).not.toBeInTheDocument();
    });

    it('renders RotateDevice in portrait mode', () => {
        (useMediaQuery as ReturnType<typeof vi.fn>).mockReturnValue(true); // Portrait true
        render(
            <MemoryRouter>
                <Landing />
            </MemoryRouter>
        );
        expect(screen.getByTestId('rotate-device')).toBeInTheDocument();
        expect(screen.queryByText('go')).not.toBeInTheDocument();
    });

    it('Go link points at newMeetingPath', () => {
        render(
            <MemoryRouter>
                <Landing />
            </MemoryRouter>
        );
        const link = screen.getByTestId('landing-go');
        expect(link).toHaveAttribute('href', '/en/new');
        fireEvent.click(link);
    });

    it('hides description and go button in museum mode', () => {
        vi.mocked(useAppMode).mockReturnValue({
            mode: 'museum',
            isMuseumMode: true,
            setAppMode: vi.fn(),
        });

        render(
            <MemoryRouter>
                <Landing />
            </MemoryRouter>
        );

        expect(screen.queryByText('description')).not.toBeInTheDocument();
        expect(screen.queryByTestId('landing-go')).not.toBeInTheDocument();
    });
});
