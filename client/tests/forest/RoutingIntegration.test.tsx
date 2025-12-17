
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, useLocation, Routes, Route } from 'react-router';
import Main from '../../src/components/Main';
import routes from '../../src/routes.json';

// --- Mocks ---

// Mock topics data
vi.mock('../../src/prompts/topics_en.json', () => ({
    default: {
        topics: [
            { id: "test-topic", title: "Test Topic", prompt: "Test Prompt" }
        ],
        system: "System Prompt [TOPIC]"
    }
}));
vi.mock('../../src/prompts/topics_sv.json', () => ({
    default: {
        topics: [
            { id: "test-topic", title: "Test Topic", prompt: "Test Prompt" }
        ],
        system: "System Prompt [TOPIC]"
    }
}));

// Helper to confirm current path
const LocationSpy = () => {
    const location = useLocation();
    return <span data-testid="location-spy">{location.pathname}</span>;
};

// Mock child components to isolate Main logic and spy on location
vi.mock('../../src/components/Overlay', () => ({
    default: ({ children }) => <div data-testid="overlay">{children}</div>
}));
vi.mock('../../src/components/MainOverlays', () => ({
    default: () => <div data-testid="main-overlays">MainOverlays</div>
}));

// Landing Mock
vi.mock('../../src/components/settings/Landing', () => ({
    default: ({ onContinueForward }) => (
        <div data-testid="landing">
            <LocationSpy />
            <button onClick={onContinueForward} data-testid="landing-btn">Lets Go</button>
        </div>
    )
}));

// Navbar Mock
vi.mock('../../src/components/Navbar', () => ({
    default: () => <div data-testid="navbar">Navbar</div>
}));

// SelectTopic Mock
vi.mock('../../src/components/settings/SelectTopic', () => ({
    default: ({ onContinueForward }) => (
        <div data-testid="select-topic">
            <LocationSpy />
            <button onClick={() => onContinueForward({ topic: "test-topic" })} data-testid="topic-btn">Select Topic</button>
        </div>
    )
}));

// SelectFoods Mock
vi.mock('../../src/components/settings/SelectFoods', () => ({
    default: ({ onContinueForward }) => (
        <div data-testid="select-foods">
            <LocationSpy />
            <button onClick={() => onContinueForward({ foods: [{ id: "apple" }] })} data-testid="foods-btn">Select Foods</button>
        </div>
    )
}));

// Council Mock
vi.mock('../../src/components/Council', () => ({
    default: () => (
        <div data-testid="council">
            <LocationSpy />
            Council
        </div>
    )
}));

vi.mock('../../src/components/RotateDevice', () => ({
    default: () => <div data-testid="rotate-device">RotateDevice</div>
}));
vi.mock('../../src/components/FullscreenButton', () => ({
    default: () => <div data-testid="fullscreen-btn">Fullscreen</div>
}));

// Mock Forest to avoid complex utils dependencies
vi.mock('../../src/components/Forest', () => ({
    default: () => <div data-testid="forest">Forest</div>
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key) => key, i18n: { changeLanguage: () => new Promise(() => { }) } }),
    initReactI18next: { type: '3rdParty', init: () => { } }
}));

// Mock utils
vi.mock('../../src/utils', () => ({
    usePortrait: () => false,
    useDocumentVisibility: () => true,
    dvh: 'vh',
    useMobile: () => false,
    useMobileXs: () => false,
    capitalizeFirstLetter: (str) => str
}));

describe('Forest Routing Integration', () => {
    it('preserves /sv/ language prefix when navigating flow', async () => {
        // Setup simple router structure mimicking App.tsx
        // <Main> expects to be rendered within a route that has provided the lang
        // But Main itself defines sub-routes.
        // We need to mount Main at /sv/*

        render(
            <MemoryRouter initialEntries={['/sv/']}>
                <Routes>
                    <Route path="/:lang/*" element={<Main lang="sv" />} />
                </Routes>
            </MemoryRouter>
        );

        // 1. Landing Page
        expect(screen.getByTestId('landing')).toBeInTheDocument();
        expect(screen.getByTestId('location-spy')).toHaveTextContent('/sv/');

        // 2. Click "Lets Go" -> Topics
        fireEvent.click(screen.getByTestId('landing-btn'));
        await waitFor(() => {
            expect(screen.getByTestId('select-topic')).toBeInTheDocument();
        });
        expect(screen.getByTestId('location-spy')).toHaveTextContent(`/sv/${routes.topics}`);

        // 3. Select Topic -> Foods
        fireEvent.click(screen.getByTestId('topic-btn'));
        await waitFor(() => {
            expect(screen.getByTestId('select-foods')).toBeInTheDocument();
        });
        expect(screen.getByTestId('location-spy')).toHaveTextContent(`/sv/${routes.foods}`);

        // 4. Select Foods -> Meeting
        fireEvent.click(screen.getByTestId('foods-btn'));
        await waitFor(() => {
            expect(screen.getByTestId('council')).toBeInTheDocument();
        });
        // Meeting URL typically includes ID, e.g. /sv/meeting/new or /sv/meeting/123
        expect(screen.getByTestId('location-spy')).toHaveTextContent(new RegExp(`\/sv\/${routes.meeting}\/.*`));
    });

    it('preserves /en/ language prefix when navigating flow', async () => {
        render(
            <MemoryRouter initialEntries={['/en/']}>
                <Routes>
                    <Route path="/:lang/*" element={<Main lang="en" />} />
                </Routes>
            </MemoryRouter>
        );

        // 1. Landing
        expect(screen.getByTestId('landing')).toBeInTheDocument();
        expect(screen.getByTestId('location-spy')).toHaveTextContent('/en/');

        // 2. Navigate
        fireEvent.click(screen.getByTestId('landing-btn'));
        await waitFor(() => {
            expect(screen.getByTestId('location-spy')).toHaveTextContent(`/en/${routes.topics}`);
        });
    });
});
