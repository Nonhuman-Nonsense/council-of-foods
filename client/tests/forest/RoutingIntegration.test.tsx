
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, useLocation, Routes, Route } from 'react-router';
import Main from '@main/Main';
import routes from '@/routes.json';

vi.mock('@api/createMeeting', () => ({
    createMeeting: vi.fn().mockResolvedValue({ meetingId: 99, liveKey: 'test-live-key' }),
}));

vi.mock('@shared/prompts/topics_en.json', () => ({
    default: {
        topics: [
            { id: "test-topic", title: "Test Topic", prompt: "Test Prompt" }
        ],
        system: "System Prompt [TOPIC]"
    }
}));
vi.mock('@shared/prompts/topics_sv.json', () => ({
    default: {
        topics: [
            { id: "test-topic", title: "Test Topic", prompt: "Test Prompt" }
        ],
        system: "System Prompt [TOPIC]"
    }
}));

const LocationSpy = () => {
    const location = useLocation();
    return <span data-testid="location-spy">{location.pathname}</span>;
};

vi.mock('@main/overlay/Overlay', () => ({
    default: ({ children }: { children: React.ReactNode }) => <div data-testid="overlay">{children}</div>
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
                    <LocationSpy />
                    <button type="button" data-testid="landing-btn" onClick={() => navigate(newMeetingPath)}>Lets Go</button>
                </div>
            );
        }
    };
});

vi.mock('@main/Navbar', () => ({
    default: () => <div data-testid="navbar">Navbar</div>
}));

vi.mock('@newMeeting/SelectTopic', () => ({
    default: ({ onContinueForward }: { onContinueForward: (t: object) => void }) => (
        <div data-testid="select-topic">
            <LocationSpy />
            <button type="button" onClick={() => onContinueForward({ id: "test-topic", title: "Test Topic", description: "D", prompt: "P" })} data-testid="topic-btn">Select Topic</button>
        </div>
    )
}));

vi.mock('@newMeeting/SelectCharacters', () => ({
    default: ({ onContinueForward }: { onContinueForward: (x: { characters: { id: string }[] }) => void }) => (
        <div data-testid="select-foods">
            <LocationSpy />
            <button type="button" onClick={() => onContinueForward({ characters: [{ id: "apple" }] })} data-testid="foods-btn">Select Foods</button>
        </div>
    ),
    getCharacterSetupBundle: () => ({ characters: [] }),
    createDefaultHumans: () => [],
}));

vi.mock('@council/Council', () => ({
    default: () => (
        <div data-testid="council">
            <LocationSpy />
            Council
        </div>
    )
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

vi.mock('@forest/Forest', () => ({
    default: () => <div data-testid="forest">Forest</div>
}));

vi.mock('@/utils', () => ({
    usePortrait: () => false,
    useDocumentVisibility: () => true,
    dvh: 'vh',
    useMobile: () => false,
    useMobileXs: () => false,
    capitalizeFirstLetter: (str: string) => str,
    toTitleCase: (str: string) => str,
    filename: (str: string) => str
}));

describe('Forest Routing Integration', () => {
    it('preserves /sv/ language prefix when navigating flow', async () => {
        render(
            <MemoryRouter initialEntries={['/sv/']}>
                <Routes>
                    <Route path="/:lang/*" element={<Main lang="sv" />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByTestId('landing')).toBeInTheDocument();
        expect(screen.getByTestId('location-spy')).toHaveTextContent('/sv/');

        fireEvent.click(screen.getByTestId('landing-btn'));
        await waitFor(() => {
            expect(screen.getByTestId('select-topic')).toBeInTheDocument();
        });
        expect(screen.getByTestId('location-spy')).toHaveTextContent(`/sv/${routes.newMeeting}`);

        fireEvent.click(screen.getByTestId('topic-btn'));
        await waitFor(() => {
            expect(screen.getByTestId('select-foods')).toBeInTheDocument();
        });
        expect(screen.getByTestId('location-spy')).toHaveTextContent(`/sv/${routes.newMeeting}`);

        fireEvent.click(screen.getByTestId('foods-btn'));
        await waitFor(() => {
            expect(screen.getByTestId('council')).toBeInTheDocument();
        });
        expect(screen.getByTestId('location-spy')).toHaveTextContent(`/sv/${routes.meeting}/99`);
    });

    it('preserves /en/ language prefix when navigating flow', async () => {
        render(
            <MemoryRouter initialEntries={['/en/']}>
                <Routes>
                    <Route path="/:lang/*" element={<Main lang="en" />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByTestId('landing')).toBeInTheDocument();
        expect(screen.getByTestId('location-spy')).toHaveTextContent('/en/');

        fireEvent.click(screen.getByTestId('landing-btn'));
        await waitFor(() => {
            expect(screen.getByTestId('location-spy')).toHaveTextContent(`/en/${routes.newMeeting}`);
        });
    });
});
