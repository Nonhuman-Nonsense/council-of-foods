import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Landing from '@newMeeting/Landing';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import type { MeetingSetupUserEvent } from '@newMeeting/meetingSetup';

// Mock dependencies
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock('@/navigation', () => ({
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

vi.mock('@/settings/councilSettings', () => ({
    useCouncilSettings: vi.fn(() => ({
        isMuseumMode: false,
        mode: 'web',
        setAppMode: vi.fn(),
        agentMode: "off",
        setAgentMode: vi.fn(),
    })),
}));

import { useMediaQuery } from 'react-responsive';
import { useMobile } from '@/utils';
import { useCouncilSettings } from '@/settings/councilSettings';
import { DEV_LOG_CATEGORIES } from '@/logger';

function mockCouncilSettings(overrides: Partial<ReturnType<typeof useCouncilSettings>> = {}): ReturnType<typeof useCouncilSettings> {
    return {
        isMuseumMode: false,
        mode: 'web',
        setAppMode: vi.fn(),
        agentMode: 'off',
        setAgentMode: vi.fn(),
        pttHardwareEnabled: false,
        setPttHardwareEnabled: vi.fn(),
        museumSwitchButtonEnabled: false,
        setMuseumSwitchButtonEnabled: vi.fn(),
        devLogEnabled: false,
        setDevLogEnabled: vi.fn(),
        devLogCategories: Object.fromEntries(DEV_LOG_CATEGORIES.map((c) => [c, false])) as Record<typeof DEV_LOG_CATEGORIES[number], boolean>,
        setDevLogCategoryEnabled: vi.fn(),
        setAllDevLogCategories: vi.fn(),
        ...overrides,
    };
}

/**
 * Landing lives inside MeetingSetupShell's outlet, and reports the visitor
 * leaving the welcome screen through its context.
 */
function renderLanding(setLastUserEvent: (event: MeetingSetupUserEvent | null) => void = vi.fn()) {
    return render(
        <MemoryRouter>
            <Routes>
                <Route element={<Outlet context={{ setLastUserEvent }} />}>
                    <Route path="/" element={<Landing />} />
                </Route>
            </Routes>
        </MemoryRouter>
    );
}

describe('Landing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default to landscape (not portrait) and not mobile for base case
        (useMediaQuery as ReturnType<typeof vi.fn>).mockReturnValue(false); // isPortrait = false
        (useMobile as ReturnType<typeof vi.fn>).mockReturnValue(false);
        vi.mocked(useCouncilSettings).mockReturnValue(mockCouncilSettings());
    });

    afterEach(() => {
        cleanup();
    });

    it('renders welcome message and "Go" button in landscape mode', () => {
        renderLanding();
        expect(screen.getByText('landing.welcome')).toBeInTheDocument();
        expect(screen.getByText('APP.COUNCIL')).toBeInTheDocument();
        expect(screen.getByText('landing.go')).toBeInTheDocument();
        expect(screen.getByText('landing.description')).toBeInTheDocument();
        expect(screen.queryByTestId('rotate-device')).not.toBeInTheDocument();
    });

    it('renders RotateDevice in portrait mode', () => {
        (useMediaQuery as ReturnType<typeof vi.fn>).mockReturnValue(true); // Portrait true
        renderLanding();
        expect(screen.getByTestId('rotate-device')).toBeInTheDocument();
        expect(screen.queryByText('landing.go')).not.toBeInTheDocument();
    });

    it('Go link points at newMeetingPath', () => {
        renderLanding();
        const link = screen.getByTestId('landing-go');
        expect(link).toHaveAttribute('href', '/en/new');
        fireEvent.click(link);
    });

    it('reports leaving the welcome screen so the agent can follow along', () => {
        // Clicking past the welcome is the only way through it with the mic
        // off, and it changes the step with no other signal the agent sees.
        const setLastUserEvent = vi.fn();
        renderLanding(setLastUserEvent);

        fireEvent.click(screen.getByTestId('landing-go'));

        expect(setLastUserEvent).toHaveBeenCalledWith({ type: 'setup_started' });
    });

    it('hides description and go button in museum mode', () => {
        vi.mocked(useCouncilSettings).mockReturnValue(mockCouncilSettings({ mode: 'museum', isMuseumMode: true }));

        renderLanding();

        expect(screen.queryByText('landing.description')).not.toBeInTheDocument();
        expect(screen.queryByTestId('landing-go')).not.toBeInTheDocument();
    });
});
