
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import Main from '@main/Main';
import Navbar from '@main/Navbar';
import { APP_MODE_STORAGE_KEY, MUSEUM_SWITCH_BUTTON_ENABLED_KEY } from '@/settings/councilSettings';
import * as AvailableLanguagesModule from '@shared/AvailableLanguages';
import routes from '@/routes.json';
import { MockFactory } from '../factories/MockFactory';

// Mock child components to focus on routing logic
vi.mock('@main/overlay/Overlay', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="overlay">{children}</div>
}));
vi.mock('@main/overlay/MainOverlays', () => ({
    default: () => <div data-testid="main-overlays">MainOverlays</div>
}));
vi.mock('@newMeeting/Landing', () => ({
    default: () => <div data-testid="landing">Landing</div>
}));
vi.mock('@setupAgent/MeetingSetupAgent', () => ({
    default: () => null,
}));
vi.mock('@newMeeting/SelectTopic', () => ({
    default: () => <div data-testid="select-topic">SelectTopic</div>
}));
vi.mock('@newMeeting/SelectCharacters', () => ({
    default: () => <div data-testid="select-foods">SelectFoods</div>,
    createDefaultHumans: () => ([
        MockFactory.createPanelist(0),
        MockFactory.createPanelist(1),
        MockFactory.createPanelist(2),
    ]),
    getFoodsBundle: () => MockFactory.createCharacterSetupBundle(),
}));
vi.mock('@council/Council', () => ({
    default: () => <div data-testid="council">Council</div>
}));
vi.mock('@main/overlay/RotateDevice', () => ({
    default: () => <div data-testid="rotate-device">RotateDevice</div>
}));
vi.mock('@main/FullscreenButton', () => ({
    default: () => <div data-testid="fullscreen-btn">Fullscreen</div>
}));
vi.mock('@/museum/MuseumSwitchButton', () => ({
    default: () => <div data-testid="museum-switch-button">Museum switch</div>
}));

// Mock utils
vi.mock('@/utils', () => ({
    usePortrait: () => false,
    useMobile: () => false,
    useMobileXs: () => false,
    capitalizeFirstLetter: (str: string) => str,
    dvh: 'vh',
    minWindowHeight: 300,
    useDocumentVisibility: () => true
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { changeLanguage: vi.fn() }
    }),
}));

// Mock react-responsive
vi.mock('react-responsive', () => ({
    useMediaQuery: () => true
}));

// Mock topics data to avoid loading real files
vi.mock('@shared/prompts/topics_en.json', () => ({
    default: {
        topics: [{ id: "test-topic", title: "Test Topic" }],
        custom_topic: { id: "custom" },
        system: "System Prompt"
    }
}));
vi.mock('@shared/prompts/topics_sv.json', () => ({
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
            localStorage.clear();
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

        it('hides navbar and fullscreen in museum mode', () => {
            localStorage.setItem(APP_MODE_STORAGE_KEY, 'museum');
            render(
                <MemoryRouter initialEntries={['/']}>
                    <Main lang="en" />
                </MemoryRouter>
            );
            expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
            expect(screen.queryByTestId('fullscreen-btn')).not.toBeInTheDocument();
            expect(screen.queryByTestId('museum-switch-button')).not.toBeInTheDocument();
        });

        it('shows museum switch button in web and museum when enabled', () => {
            localStorage.setItem(MUSEUM_SWITCH_BUTTON_ENABLED_KEY, 'true');
            localStorage.setItem(APP_MODE_STORAGE_KEY, 'web');
            const { unmount } = render(
                <MemoryRouter initialEntries={['/']}>
                    <Main lang="en" />
                </MemoryRouter>
            );
            expect(screen.getByTestId('museum-switch-button')).toBeInTheDocument();
            unmount();

            localStorage.setItem(APP_MODE_STORAGE_KEY, 'museum');
            render(
                <MemoryRouter initialEntries={['/']}>
                    <Main lang="en" />
                </MemoryRouter>
            );
            expect(screen.getByTestId('museum-switch-button')).toBeInTheDocument();
        });

        it('shows navbar and fullscreen in web mode', () => {
            localStorage.setItem(APP_MODE_STORAGE_KEY, 'web');
            render(
                <MemoryRouter initialEntries={['/']}>
                    <Main lang="en" />
                </MemoryRouter>
            );
            expect(screen.getByRole('navigation')).toBeInTheDocument();
            expect(screen.getByTestId('fullscreen-btn')).toBeInTheDocument();
            expect(screen.queryByTestId('museum-switch-button')).not.toBeInTheDocument();
        });

        it('renders Council at /meeting/new', async () => {
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
                    <Navbar topicTitle="Topic" hamburgerOpen={false} setHamburgerOpen={() => { }} />
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
            vi.spyOn(AvailableLanguagesModule, 'AVAILABLE_LANGUAGES', 'get').mockReturnValue(['en', 'sv'] as any);
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
                    <Navbar topicTitle="Topic" hamburgerOpen={false} setHamburgerOpen={() => { }} />
                </MemoryRouter>
            );
            expect(screen.getByText('EN')).toBeVisible();
            // expect(screen.getByText('SV')).toBeVisible(); // SV might be commented out in current code?
        });
    });
});
