
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router';
import Main from '../../src/components/Main';
import routes from '../../src/routes.json';

// Mock topics data
vi.mock('../../src/prompts/topics_en.json', () => ({
    default: {
        topics: [
            { id: "test-topic", title: "Test Topic", prompt: "Test Prompt" }
        ],
        system: "System Prompt [TOPIC]"
    }
}));

// Mock child components to isolate Main logic
vi.mock('../../src/components/Overlay', () => ({
    default: ({ children }) => <div data-testid="overlay">{children}</div>
}));
vi.mock('../../src/components/MainOverlays', () => ({
    default: () => <div data-testid="main-overlays">MainOverlays</div>
}));
vi.mock('../../src/components/settings/Landing', () => ({
    default: ({ onContinueForward }) => (
        <div data-testid="landing">
            <button onClick={onContinueForward} data-testid="landing-btn">Lets Go</button>
        </div>
    )
}));
vi.mock('../../src/components/Navbar', () => ({
    default: () => <div data-testid="navbar">Navbar</div>
}));
vi.mock('../../src/components/settings/SelectTopic', () => ({
    default: ({ onContinueForward }) => (
        <div data-testid="select-topic">
            <button onClick={() => onContinueForward({ topic: "test-topic" })} data-testid="topic-btn">Select Topic</button>
        </div>
    )
}));
vi.mock('../../src/components/settings/SelectFoods', () => ({
    default: ({ onContinueForward }) => (
        <div data-testid="select-foods">
            <button onClick={() => onContinueForward({ foods: [{ id: "apple" }] })} data-testid="foods-btn">Select Foods</button>
        </div>
    )
}));
vi.mock('../../src/components/Council', () => ({
    default: () => <div data-testid="council">Council</div>
}));
vi.mock('../../src/components/RotateDevice', () => ({
    default: () => <div data-testid="rotate-device">RotateDevice</div>
}));
vi.mock('../../src/components/FullscreenButton', () => ({
    default: () => <div data-testid="fullscreen-btn">Fullscreen</div>
}));

// Mock react-i18next
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key) => key, i18n: { changeLanguage: () => new Promise(() => { }) } }),
    initReactI18next: { type: '3rdParty', init: () => { } }
}));

// Mock utils
vi.mock('../../src/utils', () => ({
    usePortrait: () => false,
    useMobile: () => false,
    useDocumentVisibility: () => true,
    dvh: 'vh',
    minWindowHeight: 300,
    filename: (str) => str
}));

// Mock Fetch
global.fetch = vi.fn(() =>
    Promise.resolve({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    })
);

// Mock AudioContext
window.AudioContext = class {
    constructor() {
        this.state = 'running';
        this.destination = {};
        this.currentTime = 0;
    }
    createGain() {
        return {
            connect: vi.fn(),
            gain: {
                value: 1,
                linearRampToValueAtTime: vi.fn(),
                setValueAtTime: vi.fn()
            }
        };
    }
    createOscillator() {
        return {
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            frequency: { value: 0 }
        };
    }
    createBufferSource() {
        return {
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            buffer: null,
            loop: false
        };
    }
    decodeAudioData() {
        return Promise.resolve({});
    }
    suspend() { }
    resume() { }
};

// Mock HTMLMediaElement
window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
window.HTMLMediaElement.prototype.pause = vi.fn();

describe('Main Component (Forest)', () => {
    it('renders Landing page by default', () => {
        render(
            <MemoryRouter initialEntries={['/en/']}>
                <Routes>
                    <Route path="/:lang/*" element={<Main lang="en" />} />
                </Routes>
            </MemoryRouter>
        );
        expect(screen.getByTestId('landing')).toBeInTheDocument();
    });

    it('navigates to Topics on "Lets Go"', async () => {
        render(
            <MemoryRouter initialEntries={['/en/']}>
                <Routes>
                    <Route path="/:lang/*" element={<Main lang="en" />} />
                </Routes>
            </MemoryRouter>
        );

        fireEvent.click(screen.getByTestId('landing-btn'));

        await waitFor(() => {
            expect(screen.getByTestId('select-topic')).toBeInTheDocument();
        });
    });

    it('navigates to Foods on Topic selection', async () => {
        render(
            <MemoryRouter initialEntries={['/en/' + routes.topics]}>
                <Routes>
                    <Route path="/:lang/*" element={<Main lang="en" />} />
                </Routes>
            </MemoryRouter>
        );

        fireEvent.click(screen.getByTestId('topic-btn'));

        await waitFor(() => {
            expect(screen.getByTestId('select-foods')).toBeInTheDocument();
        });
    });

    it('renders Council when participants are selected (Flow)', async () => {
        render(
            <MemoryRouter initialEntries={['/en/' + routes.topics]}>
                <Routes>
                    <Route path="/:lang/*" element={<Main lang="en" />} />
                </Routes>
            </MemoryRouter>
        );

        // Select Topic -> Go to Foods
        fireEvent.click(screen.getByTestId('topic-btn'));
        await waitFor(() => expect(screen.getByTestId('select-foods')).toBeInTheDocument());

        // Select Foods -> Go to Council
        fireEvent.click(screen.getByTestId('foods-btn'));
        await waitFor(() => expect(screen.getByTestId('council')).toBeInTheDocument());
    });

    it('full flow: Landing -> Topics -> Foods -> Council', async () => {
        render(
            <MemoryRouter initialEntries={['/en/']}>
                <Routes>
                    <Route path="/:lang/*" element={<Main lang="en" />} />
                </Routes>
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
