
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router';
import Main from '@main/Main';
import routes from '@/routes.json';

vi.mock('@api/createMeeting', () => ({
    createMeeting: vi.fn().mockResolvedValue({ meetingId: 99, liveKey: 'test-live-key' }),
}));

vi.mock('@shared/prompts/topics_en.json', () => ({
    default: {
        topics: [
            { id: "test-topic", title: "Test Topic", description: "D", prompt: "Test Prompt" }
        ],
        custom_topic: { id: "customtopic", title: "Custom", description: "C", prompt: "Custom" },
        system: "System Prompt [TOPIC]"
    }
}));

vi.mock('@main/overlay/Overlay', () => ({
    default: ({ children }) => <div data-testid="overlay">{children}</div>
}));
vi.mock('@main/overlay/MainOverlays', () => ({
    default: () => <div data-testid="main-overlays">MainOverlays</div>
}));
vi.mock('@newMeeting/Landing', async () => {
    const { useNavigate } = await import('react-router');
    return {
        default: function MockLanding({ newMeetingPath }) {
            const navigate = useNavigate();
            return (
                <div data-testid="landing">
                    <button
                        type="button"
                        data-testid="landing-btn"
                        onClick={() => navigate(newMeetingPath)}
                    >
                        Lets Go
                    </button>
                </div>
            );
        }
    };
});
vi.mock('@main/Navbar', () => ({
    default: () => <div data-testid="navbar">Navbar</div>
}));
vi.mock('@newMeeting/SelectTopic', () => ({
    default: ({ onContinueForward }) => (
        <div data-testid="select-topic">
            <button
                type="button"
                onClick={() =>
                    onContinueForward({ id: "test-topic", title: "Test Topic", description: "D", prompt: "System Prompt Test Prompt" })
                }
                data-testid="topic-btn"
            >
                Select Topic
            </button>
        </div>
    )
}));
vi.mock('@newMeeting/SelectFoods', () => ({
    default: ({ onContinueForward }) => (
        <div data-testid="select-foods">
            <button type="button" onClick={() => onContinueForward({ foods: [{ id: "apple" }] })} data-testid="foods-btn">Select Foods</button>
        </div>
    ),
    createDefaultHumans: () => ([
        { id: "panelist0", name: "", description: "", type: "panelist", voice: "alloy", index: 0 },
        { id: "panelist1", name: "", description: "", type: "panelist", voice: "alloy", index: 1 },
        { id: "panelist2", name: "", description: "", type: "panelist", voice: "alloy", index: 2 },
    ]),
    getFoodsBundle: () => ({
        metadata: { version: "test", last_updated: "test" },
        panelWithHumans: "",
        addHuman: { id: "addhuman", name: "Add Human", description: "" },
        foods: [{ id: "water", name: "Water", description: "", voice: "alloy" }],
    }),
}));
vi.mock('@council/Council', () => ({
    default: () => <div data-testid="council">Council</div>
}));
vi.mock('@forest/Forest', () => ({
    default: () => <div data-testid="forest">Forest</div>
}));
vi.mock('@main/overlay/RotateDevice', () => ({
    default: () => <div data-testid="rotate-device">RotateDevice</div>
}));
vi.mock('@voice/MeetingVoiceGuide', () => ({
    default: () => null,
}));
vi.mock('@main/FullscreenButton', () => ({
    default: () => <div data-testid="fullscreen-btn">Fullscreen</div>
}));

vi.mock('@/utils', () => ({
    usePortrait: () => false,
    useMobile: () => false,
    useDocumentVisibility: () => true,
    dvh: 'vh',
    minWindowHeight: 300,
    filename: (str) => str
}));

global.fetch = vi.fn(() =>
    Promise.resolve({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    })
);

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
            <MemoryRouter initialEntries={[`/en/${routes.newMeeting}`]}>
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
            <MemoryRouter initialEntries={[`/en/${routes.newMeeting}`]}>
                <Routes>
                    <Route path="/:lang/*" element={<Main lang="en" />} />
                </Routes>
            </MemoryRouter>
        );

        fireEvent.click(screen.getByTestId('topic-btn'));
        await waitFor(() => expect(screen.getByTestId('select-foods')).toBeInTheDocument());

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

        fireEvent.click(screen.getByTestId('landing-btn'));
        await waitFor(() => expect(screen.getByTestId('select-topic')).toBeInTheDocument());

        fireEvent.click(screen.getByTestId('topic-btn'));
        await waitFor(() => expect(screen.getByTestId('select-foods')).toBeInTheDocument());

        fireEvent.click(screen.getByTestId('foods-btn'));
        await waitFor(() => expect(screen.getByTestId('council')).toBeInTheDocument());
    });
});
