
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router';
import Main from '../../../src/components/Main';
import routes from '../../../src/routes.json';

// Mock topics data
vi.mock('../../../src/prompts/topics_en.json', () => ({
    default: {
        topics: [
            { id: "test-topic", title: "Test Topic", prompt: "Test Prompt" }
        ],
        system: "System Prompt [TOPIC]"
    }
}));

// Mock child components to isolate Main logic
vi.mock('../../../src/components/Overlay', () => ({
    default: ({ children }) => <div data-testid="overlay">{children}</div>
}));
vi.mock('../../../src/components/MainOverlays', () => ({
    default: () => <div data-testid="main-overlays">MainOverlays</div>
}));
vi.mock('../../../src/components/settings/Landing', () => ({
    default: ({ onContinueForward }) => (
        <div data-testid="landing">
            <button onClick={onContinueForward} data-testid="landing-btn">Lets Go</button>
        </div>
    )
}));
vi.mock('../../../src/components/Navbar', () => ({
    default: () => <div data-testid="navbar">Navbar</div>
}));
vi.mock('../../../src/components/settings/SelectTopic', () => ({
    default: ({ onContinueForward }) => (
        <div data-testid="select-topic">
            <button onClick={() => onContinueForward({ topic: "test-topic" })} data-testid="topic-btn">Select Topic</button>
        </div>
    )
}));
vi.mock('../../../src/components/settings/SelectFoods', () => ({
    default: ({ onContinueForward }) => (
        <div data-testid="select-foods">
            <button onClick={() => onContinueForward({ foods: [{ id: "apple" }] })} data-testid="foods-btn">Select Foods</button>
        </div>
    )
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

// Mock react-i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key) => key, i18n: { changeLanguage: () => new Promise(() => { }) } }),
    initReactI18next: { type: '3rdParty', init: () => { } }
}));

// Mock utils
vi.mock('../../../src/utils', () => ({
    usePortrait: () => false,
    useDocumentVisibility: () => true,
    dvh: 'vh'
}));

describe('Main Component', () => {
    it.skip('renders Landing page by default', () => {
        render(
            <MemoryRouter initialEntries={['/']}>
                <Main lang="en" />
            </MemoryRouter>
        );
        expect(screen.getByTestId('landing')).toBeInTheDocument();
    });

    it.skip('navigates to Topics on "Lets Go"', async () => {
        render(
            <MemoryRouter initialEntries={['/']}>
                <Main lang="en" />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByTestId('landing-btn'));

        await waitFor(() => {
            expect(screen.getByTestId('select-topic')).toBeInTheDocument();
        });
    });

    it.skip('navigates to Foods on Topic selection', async () => {
        render(
            <MemoryRouter initialEntries={['/' + routes.topics]}>
                <Main lang="en" />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByTestId('topic-btn'));

        await waitFor(() => {
            expect(screen.getByTestId('select-foods')).toBeInTheDocument();
        });
    });

    it.skip('renders Council when participants are selected', async () => {
        render(
            <MemoryRouter initialEntries={['/' + routes.foods]}>
                <Main lang="en" />
            </MemoryRouter>
        );

        // Logic test skipped
    });

    it.skip('full flow: Landing -> Topics -> Foods -> Council', async () => {
        render(
            <MemoryRouter initialEntries={['/']}>
                <Main lang="en" />
            </MemoryRouter>
        );

        // Landing -> Topics
        fireEvent.click(screen.getByTestId('landing-btn'));
        await waitFor(() => expect(screen.getByTestId('select-topic')).toBeInTheDocument());

        // Topics -> Foods
        fireEvent.click(screen.getByTestId('topic-btn'));
        await waitFor(() => expect(screen.getByTestId('select-foods')).toBeInTheDocument());

        // Foods -> Council
        fireEvent.click(screen.getByTestId('foods-btn'));
        await waitFor(() => expect(screen.getByTestId('council')).toBeInTheDocument());
    });
});
