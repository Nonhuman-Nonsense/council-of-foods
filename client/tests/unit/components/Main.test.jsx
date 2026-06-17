
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router';
import Main from '@main/Main';
import routes from '@/routes.json';

const mockCouncil = vi.fn(() => <div data-testid="council">Council</div>);

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
vi.mock('@newMeeting/Landing', () => ({
    default: () => <div data-testid="landing">Landing</div>
}));
vi.mock('@main/Navbar', () => ({
    default: () => <div data-testid="navbar">Navbar</div>
}));
vi.mock('@newMeeting/SelectTopic', () => ({
    default: () => <div data-testid="select-topic">SelectTopic</div>
}));
vi.mock('@newMeeting/SelectCharacters', () => ({
    default: () => <div data-testid="select-foods">SelectCharacters</div>,
    createDefaultHumans: () => ([]),
    getCharacterSetupBundle: () => ({
        metadata: { version: "test", last_updated: "test" },
        panelWithHumans: "",
        addHuman: { id: "addhuman", name: "Add Human", description: "" },
        characters: [],
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

describe('Main Component', () => {
    it('renders Council on meeting route', () => {
        render(
            <MemoryRouter initialEntries={[`/en/${routes.meeting}/42`]}>
                <Routes>
                    <Route path="/:lang/*" element={<Main lang="en" />} />
                </Routes>
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
});
