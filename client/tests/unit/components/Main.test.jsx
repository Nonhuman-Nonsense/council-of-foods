
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import Main from '@main/Main';
import routes from '@/routes.json';

const mockCouncil = vi.fn(() => <div data-testid="council">Council</div>);

vi.mock('@api/createMeeting', () => ({
    createMeeting: vi.fn().mockResolvedValue({ meetingId: 99, liveKey: 'test-live-key' }),
}));

// Mock topics data
vi.mock('@shared/prompts/topics_en.json', () => ({
    default: {
        topics: [
            { id: "test-topic", title: "Test Topic", description: "D", prompt: "Test Prompt" }
        ],
        custom_topic: { id: "customtopic", title: "Custom", description: "C", prompt: "Custom" },
        system: "System Prompt [TOPIC]"
    }
}));

// Mock child components to isolate Main logic
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
            <button onClick={() => onContinueForward({ foods: [{ id: "apple" }] })} data-testid="foods-btn">Select Foods</button>
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
    default: (props) => mockCouncil(props)
}));
vi.mock('@main/overlay/RotateDevice', () => ({
    default: () => <div data-testid="rotate-device">RotateDevice</div>
}));
vi.mock('@main/FullscreenButton', () => ({
    default: () => <div data-testid="fullscreen-btn">Fullscreen</div>
}));

// Mock utils
vi.mock('@/utils', () => ({
    usePortrait: () => false,
    useMobile: () => false,
    dvh: 'vh'
}));

window.AudioContext = class {
    constructor() {
        this.state = 'running';
    }

    suspend() {
        this.state = 'suspended';
    }

    resume() {
        this.state = 'running';
    }
};

describe('Main Component', () => {
    it('renders Landing page by default', () => {
        render(
            <MemoryRouter initialEntries={['/']}>
                <Main lang="en" />
            </MemoryRouter>
        );
        expect(screen.getByTestId('landing')).toBeInTheDocument();
    });

    it('navigates to Topics on "Lets Go"', async () => {
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

    it('navigates to Foods on Topic selection', async () => {
        render(
            <MemoryRouter initialEntries={[`/${routes.newMeeting}`]}>
                <Main lang="en" />
            </MemoryRouter>
        );

        fireEvent.click(screen.getByTestId('topic-btn'));

        await waitFor(() => {
            expect(screen.getByTestId('select-foods')).toBeInTheDocument();
        });
    });

    it('renders Council on meeting route', async () => {
        render(
            <MemoryRouter initialEntries={[`/${routes.meeting}/42`]}>
                <Main lang="en" />
            </MemoryRouter>
        );
        expect(screen.getByTestId('council')).toBeInTheDocument();
        expect(mockCouncil).toHaveBeenCalledWith(expect.objectContaining({
            currentSpeakerId: '',
            isPaused: false,
            audioContext: expect.objectContaining({ current: expect.any(window.AudioContext) }),
            setAudioPaused: expect.any(Function),
            setCurrentSpeakerId: expect.any(Function),
            setPaused: expect.any(Function),
        }));
    });

    it('full flow: Landing -> Topics -> Foods -> Council', async () => {
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
