import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Council from '../../../src/components/Council';
import '@testing-library/jest-dom';

// --- Mocks ---

// Mock Child Components
vi.mock('../../../src/components/ConversationControls', () => ({
    default: ({ onMuteUnmute, isMuted }: any) => (
        <div data-testid="conversation-controls">
            <button
                data-testid="mock-mute-button"
                onClick={onMuteUnmute}
            >
                {isMuted ? "Unmute" : "Mute"}
            </button>
        </div>
    )
}));

const mockNavigate = vi.fn();

// Mock React Router
vi.mock('react-router', () => ({
    useLocation: vi.fn().mockReturnValue({ hash: '', pathname: '/en/meeting/123', state: null }),
    useNavigate: () => mockNavigate,
    useParams: vi.fn().mockReturnValue({ meetingId: '123' }),
}));

vi.mock('@api/getMeeting.js', () => ({
    getMeeting: (...args: any[]) => mockGetMeeting(...args),
}));

const mockGetMeeting = vi.fn().mockResolvedValue({
    _id: 123,
    topic: { id: 't', title: 'T', description: 'D', prompt: 'p' },
    characters: [],
    conversation: [],
    audio: [],
    state: { alreadyInvited: false, humanName: undefined },
    date: '2026-01-01',
    language: 'en',
});


// Mock Utils
vi.mock('@/utils', () => ({
    useDocumentVisibility: vi.fn().mockReturnValue(true),
    mapFoodIndex: vi.fn((total, index) => index) // Simple pass-through
}));

// Mock other children to avoid rendering complexity
vi.mock('../../../src/components/FoodItem', () => ({ default: () => <div data-testid="food-item">Food Item</div> }));
vi.mock('../../../src/components/Overlay', () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock('../../../src/components/CouncilOverlays', () => ({ default: () => <div>Council Overlays</div> }));
vi.mock('../../../src/components/Loading', () => ({ default: () => <div>Loading...</div> }));
vi.mock('../../../src/components/Output', () => ({ default: () => <div>Output</div> }));
vi.mock('../../../src/components/HumanInput', () => ({ default: () => <div>Human Input</div> }));
// Mock Background to avoid Memoization issues or complex rendering if any
vi.mock('../../../src/components/Council', async (importOriginal) => {
    const actual = await importOriginal<any>();
    return {
        ...actual,
        Background: () => <div data-testid="background">Background</div>
    };
});


// Mock useCouncilMachine Hook
const mockToggleMute = vi.fn();
// We can control the state returned by the mock hook
const mockCouncilStateMachine = {
    state: {
        councilState: 'playing',
        textMessages: [],
        audioMessages: [],
        playingNowIndex: 0,
        playNextIndex: 1,
        activeOverlay: null,
        summary: null,
        humanName: '',
        isRaisedHand: false,
        currentMeetingId: 123,
        canGoBack: true,
        canGoForward: true,
        canRaiseHand: true,
        currentSnippetIndex: 0,
        sentencesLength: 10,
        isMuted: false, // Default
        canExtendMeeting: true,
    },
    actions: {
        tryToFindTextAndAudio: vi.fn().mockReturnValue(true),
        handleOnFinishedPlaying: vi.fn(),
        handleOnSkipBackward: vi.fn(),
        handleOnSkipForward: vi.fn(),
        handleOnSubmitHumanMessage: vi.fn(),
        handleOnContinueMeetingLonger: vi.fn(),
        handleOnGenerateSummary: vi.fn(),
        handleHumanNameEntered: vi.fn(),
        handleOnRaiseHand: vi.fn(),
        cancelOverlay: vi.fn(),
        setHumanName: vi.fn(),
        setIsRaisedHand: vi.fn(),
        setCurrentSnippetIndex: vi.fn(),
        setSentencesLength: vi.fn(),
        toggleMute: mockToggleMute
    },
    socketRef: { current: null }
}

vi.mock('../../../src/hooks/useCouncilMachine', () => ({
    useCouncilMachine: () => mockCouncilStateMachine
}));


describe('Council Component', () => {
    const defaultProps = {
        liveKey: 'test-creator',
        setliveKey: vi.fn(),
        topic: { id: 't', title: 'T', description: 'D', prompt: 'p' },
        setTopic: vi.fn(),
        setUnrecoverableError: vi.fn(),
        setConnectionError: vi.fn(),
        connectionError: false
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockNavigate.mockClear();
        // Reset mock state defaults if needed
        mockCouncilStateMachine.state.isMuted = false;
    });

    it('passes toggleMute to ConversationControls and handles mute click', () => {
        render(<Council {...defaultProps} />);

        const muteButton = screen.getByTestId('mock-mute-button');
        expect(muteButton).toBeInTheDocument();
        expect(muteButton).toHaveTextContent("Mute"); // Initially not muted

        // Simulate Click
        fireEvent.click(muteButton);

        // Verify action called
        expect(mockToggleMute).toHaveBeenCalled();
    });

    it('loads replay manifest when there is no liveKey', async () => {
        render(<Council {...defaultProps} liveKey={null} />);

        await vi.waitFor(() => {
            expect(mockGetMeeting).toHaveBeenCalledWith(
                expect.objectContaining({ meetingId: 123 }),
            );
        });

        expect(mockNavigate).not.toHaveBeenCalledWith('/');
    });

    it('passes isMuted state correctly to ConversationControls', () => {
        // Change state to muted for this test
        mockCouncilStateMachine.state.isMuted = true;

        // Force re-render (render again with new mock state)
        render(<Council {...defaultProps} />);

        const muteButton = screen.getByTestId('mock-mute-button');
        expect(muteButton).toHaveTextContent("Unmute"); // Should reflect mocked state
    });
});
