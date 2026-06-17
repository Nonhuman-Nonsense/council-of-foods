
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import Main from '@main/Main';
import routes from '@/routes.json';

const mockCouncil = vi.fn(() => <div data-testid="council">Council</div>);

vi.mock('@shared/AvailableLanguages', () => ({
    AVAILABLE_LANGUAGES: ['en'],
    GOOGLE_LANGUAGE_MAP: { en: 'en-GB' },
    SUPPORTED_LOCALES: ['en-US', 'en-GB', 'en-AU', 'en-IN'],
}));

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
    const { useRouting } = await import('@/routing');
    return {
        default: function MockLanding() {
            const navigate = useNavigate();
            const { newMeetingPath } = useRouting();
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
vi.mock('@newMeeting/SelectCharacters', () => ({
    default: ({ onContinueForward }) => (
        <div data-testid="select-foods">
            <button
                type="button"
                onClick={() => onContinueForward({ characters: [{ id: "apple", name: "Apple", description: "", prompt: "", voice: "alloy" }] })}
                data-testid="foods-btn"
            >
                Select Foods
            </button>
        </div>
    ),
    createDefaultHumans: () => ([
        { id: "panelist0", name: "", description: "", prompt: "", voice: "alloy" },
        { id: "panelist1", name: "", description: "", prompt: "", voice: "alloy" },
        { id: "panelist2", name: "", description: "", prompt: "", voice: "alloy" },
    ]),
    getCharacterSetupBundle: () => ({
        metadata: { version: "test", last_updated: "test" },
        panelWithHumans: "",
        addHuman: { id: "addhuman", name: "Add Human", description: "" },
        characters: [{ id: "chair", name: "Chair", description: "", prompt: "", voice: "alloy" }],
    }),
}));
vi.mock('@council/Council', () => ({
    default: (props) => mockCouncil(props)
}));
vi.mock('@forest/Forest', () => ({
    default: () => null,
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

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key) => key,
        i18n: { language: 'en', changeLanguage: () => new Promise(() => { }) },
    }),
    initReactI18next: { type: '3rdParty', init: () => { } }
}));

vi.mock('@/utils', () => ({
    usePortrait: () => false,
    useMobile: () => false,
    useMobileXs: () => false,
    useDocumentVisibility: () => true,
    dvh: 'vh',
    minWindowHeight: 300,
    filename: (str) => str,
    toTitleCase: (str) => str,
    capitalizeFirstLetter: (str) => str,
}));

window.AudioContext = class {
    constructor() {
        this.state = 'running';
        this.destination = {};
        this.currentTime = 0;
    }

    suspend() {
        this.state = 'suspended';
    }

    resume() {
        this.state = 'running';
    }
};

describe('Main Component (Foods)', () => {
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

    it('full flow: Landing -> Topics -> Foods -> Council', async () => {
        render(
            <MemoryRouter initialEntries={['/']}>
                <Main lang="en" />
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
