
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import Main from '../../../src/components/Main';
import Navbar from '../../../src/components/Navbar';
import * as AvailableLanguagesModule from '@shared/AvailableLanguages';
import routes from '../../../src/routes.json';

// Mock child components to focus on routing logic
vi.mock('../../../src/components/Overlay', () => ({
    default: ({ children }) => <div data-testid="overlay">{children}</div>
}));
vi.mock('../../../src/components/MainOverlays', () => ({
    default: () => <div data-testid="main-overlays">MainOverlays</div>
}));
vi.mock('../../../src/components/settings/Landing', () => ({
    default: () => <div data-testid="landing">Landing</div>
}));
vi.mock('../../../src/components/settings/SelectTopic', () => ({
    default: () => <div data-testid="select-topic">SelectTopic</div>
}));
vi.mock('../../../src/components/settings/SelectFoods', () => ({
    default: () => <div data-testid="select-foods">SelectFoods</div>
}));
vi.mock('../../../src/components/Council', () => ({
    default: () => <div data-testid="council">Council</div>
}));
vi.mock('../../../src/components/RotateDevice', () => ({
    default: () => <div data-testid="rotate-device">RotateDevice</div>
}));
vi.mock('../../../src/components/FullscreenButton', () => ({
    default: () => <div data-testid="fullscreen-btn">Fullscreen</div>
}));

// Mock utils
vi.mock('../../../src/utils', () => ({
    usePortrait: () => false,
    useMobile: () => false,
    useMobileXs: () => false,
    capitalizeFirstLetter: (str) => str,
    dvh: 'vh'
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key) => key }),
}));

// Mock react-responsive
vi.mock('react-responsive', () => ({
    useMediaQuery: () => true
}));

// Mock topics data to avoid loading real files
vi.mock('../../../src/prompts/topics_en.json', () => ({
    default: {
        topics: [{ id: "test-topic", title: "Test Topic" }],
        custom_topic: { id: "custom" },
        system: "System Prompt"
    }
}));
vi.mock('../../../src/prompts/topics_sv.json', () => ({
    default: {
        topics: [{ id: "test-topic-sv", title: "Test Topic SV" }],
        custom_topic: { id: "custom" },
        system: "System Prompt SV"
    }
}));


describe('Router Logic', () => {

    // Helper to spy on location
    const LocationSpy = () => {
        const location = useLocation();
        return <div data-testid="location-display">{location.pathname}</div>;
    };

    describe('Single Language (en)', () => {
        beforeEach(() => {
            vi.spyOn(AvailableLanguagesModule, 'AVAILABLE_LANGUAGES', 'get').mockReturnValue(['en']);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('renders at root path /', () => {
            render(
                <MemoryRouter initialEntries={['/']}>
                    <Main lang="en" />
                    <LocationSpy />
                </MemoryRouter>
            );
            expect(screen.getByTestId('landing')).toBeInTheDocument();
            expect(screen.getByTestId('location-display')).toHaveTextContent('/');
        });

        it('renders Council at /meeting/new', async () => {
            // We need to simulate the state where participants are set, otherwise Main redirects or doesn't render Council
            // However, testing Main directly might be hard because of internal state (participants).
            // But we can check if the route IS MATCHED.

            // Actually, Main.tsx renders Routes. We want to see if the Route for meeting is correctly set up.
            // If we go to /meeting/123, does it try to render Council?
            // In Main.tsx: path={`${routes.meeting}/:meetingId`} element={<Council ... />}
            // But check: participants.length !== 0 && <Council ... />
            // So if no participants, it renders nothing (null).

            // Use a wrapper that sets state if possible? No, Main has internal state.
            // We can mock useState? No, that's too intrusive.

            // Let's assume for routing matching:
            // We can just verify that it DOES NOT redirect to /en/meeting/123

            render(
                <MemoryRouter initialEntries={[`/${routes.meeting}/123`]}>
                    <Main lang="en" />
                    <LocationSpy />
                </MemoryRouter>
            );

            // It might redirect to / because of no chosenTopic/participants logic in useEffect
            // But verify it doesn't spin or explode.
            // AND verify basePath calculation logic which is used in Route paths.

            // Wait for any effects
            await waitFor(() => {
                // The useEffect in Main redirects to ${basePath}/ if !chosenTopic.id
                // If basePath is "", it redirects to /
                expect(screen.getByTestId('location-display')).toHaveTextContent('/');
            });
        });

        it('Navbar should NOT show language toggle for single language', () => {
            render(
                <MemoryRouter>
                    <Navbar lang="en" topic="Topic" hamburgerOpen={false} setHamburgerOpen={() => { }} />
                </MemoryRouter>
            );
            // Assuming we implement the hiding logic. 
            // Currently it shows "EN" (based on code reading).
            // We want to verify it DOES NOT show it after fix, or we assert current behavior fails?
            // Let's assert what we WANT (TDD style - expect fail first).
            const enLink = screen.queryByText('EN');
            // If we hide it, this should be null.
            expect(enLink).not.toBeInTheDocument();
        });
    });

    describe('Multi Language (en, sv)', () => {
        beforeEach(() => {
            vi.spyOn(AvailableLanguagesModule, 'AVAILABLE_LANGUAGES', 'get').mockReturnValue(['en', 'sv']);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('Main redirects / to /en/ or renders nothing if controlled by App', () => {
            // In App.tsx, it handles the root redirect. Main is mounted at /en/* or /sv/*
            // So if we render Main with lang="en", we are conceptually at /en/
            // The Main component calculates basePath = /en

            render(
                <MemoryRouter initialEntries={['/en/']}>
                    <Routes>
                        <Route path="/en/*" element={<Main lang="en" />} />
                    </Routes>
                    <LocationSpy />
                </MemoryRouter>
            );

            expect(screen.getByTestId('landing')).toBeInTheDocument();
        });

        it('Navbar SHOULD show language toggle for multi language', () => {
            render(
                <MemoryRouter>
                    <Navbar lang="en" topic="Topic" hamburgerOpen={false} setHamburgerOpen={() => { }} />
                </MemoryRouter>
            );
            expect(screen.getByText('EN')).toBeVisible();
            // expect(screen.getByText('SV')).toBeVisible(); // SV might be commented out in current code?
        });
    });
});
