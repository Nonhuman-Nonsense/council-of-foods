import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Council from '@council/Council';
import '@testing-library/jest-dom';
import { MockFactory } from '../factories/MockFactory';

// --- Mocks ---

// Mock Child Components
vi.mock('@council/ConversationControls', () => ({
    default: ({ onMuteUnmute, isMuted, hidden }: any) => (
        <div data-testid="conversation-controls" aria-hidden={hidden}>
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
    topic: MockFactory.createTopic({ id: 't', title: 'T', description: 'D', prompt: 'p' }),
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
    useMobile: vi.fn().mockReturnValue(false),
    mapFoodIndex: vi.fn((total, index) => index) // Simple pass-through
}));

// Mock other children to avoid rendering complexity
vi.mock('@council/FoodItem', () => ({ default: () => <div data-testid="food-item">Food Item</div> }));
vi.mock('@main/overlay/Overlay', () => ({ default: ({ children }: any) => <div>{children}</div> }));
vi.mock('@council/overlays/CouncilOverlays', () => ({ default: () => <div>Council Overlays</div> }));
vi.mock('@main/Loading', () => ({ default: () => <div>Loading...</div> }));
vi.mock('@council/output/Output', () => ({
    default: () => <div data-testid="output">Output</div>,
}));
vi.mock('@council/humanInput/HumanInput', () => ({ default: () => <div>Human Input</div> }));
vi.mock('@council/FoodsCouncilScene', () => ({ default: () => <div data-testid="foods-scene">Foods Scene</div> }));

let mockMetaAgentActivate = false;

vi.mock('@museum/metaAgent/MeetingMetaAgent', async () => {
    const React = await import('react');
    return {
        default: (props: { setMetaAgentActive: (active: boolean) => void }) => {
            React.useEffect(() => {
                if (!mockMetaAgentActivate) return;
                props.setMetaAgentActive(true);
            }, []);
            return null;
        },
    };
});


// Mock useCouncilMachine Hook
const mockToggleMute = vi.fn();
const mockUseCouncilMachine = vi.fn();
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
        isRaisedHand: false,
        currentMeetingId: 123,
        canGoBack: true,
        canGoForward: true,
        canRaiseHand: true,
        currentSnippetIndex: 0,
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
        setIsRaisedHand: vi.fn(),
        setCurrentSnippetIndex: vi.fn(),
        toggleMute: mockToggleMute
    },
    socketRef: { current: null }
}

vi.mock('@council/hooks/useCouncilMachine', () => ({
    useCouncilMachine: (...args: any[]) => mockUseCouncilMachine(...args)
}));

const mockUseCouncilSettings = vi.fn(() => ({
  isMuseumMode: false,
  mode: 'web' as const,
  setAppMode: vi.fn(),
  pushToTalkMode: false,
  setPushToTalkMode: vi.fn(),
}));

vi.mock('@/settings/useCouncilSettings', () => ({
    useCouncilSettings: () => mockUseCouncilSettings(),
}));


describe('Council Component', () => {
    const defaultProps = {
        liveKey: 'test-creator',
        setliveKey: vi.fn(),
        topic: MockFactory.createTopic({ id: 't', title: 'T', description: 'D', prompt: 'p' }),
        setTopic: vi.fn(),
        setUnrecoverableError: vi.fn(),
        setConnectionError: vi.fn(),
        connectionError: false,
        meetingAudioContext: { current: null },
        setMeetingPlaybackPaused: vi.fn(),
        currentSpeakerId: '',
        setCurrentSpeakerId: vi.fn(),
        isPaused: false,
        setPaused: vi.fn(),
        metaAgentActive: false,
        setMetaAgentActive: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mockNavigate.mockClear();
        mockMetaAgentActivate = false;
        mockUseCouncilMachine.mockReturnValue(mockCouncilStateMachine);
        // Reset mock state defaults if needed
        mockCouncilStateMachine.state.councilState = 'playing';
        mockCouncilStateMachine.state.textMessages = [];
        mockCouncilStateMachine.state.playNextIndex = 1;
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

    it('passes lifted runtime state into useCouncilMachine', () => {
        render(<Council {...defaultProps} />);

        expect(mockUseCouncilMachine).toHaveBeenCalledWith(expect.objectContaining({
            humanName: '',
            setHumanName: expect.any(Function),
            meetingAudioContext: defaultProps.meetingAudioContext,
            isPaused: defaultProps.isPaused,
            setPaused: defaultProps.setPaused,
            setMeetingPlaybackPaused: defaultProps.setMeetingPlaybackPaused,
        }));
    });

    it('hides conversation controls in museum mode but keeps them in the layout', () => {
        mockUseCouncilSettings.mockReturnValue({
          isMuseumMode: true,
          mode: 'museum',
          setAppMode: vi.fn(),
          pushToTalkMode: false,
          setPushToTalkMode: vi.fn(),
        });

        render(<Council {...defaultProps} />);

        expect(screen.getByTestId('conversation-controls')).toHaveAttribute('aria-hidden', 'true');
    });

    it('surfaces an unrecoverable error if human_panelist has no awaiting marker', () => {
        mockCouncilStateMachine.state.councilState = 'human_panelist';
        mockCouncilStateMachine.state.textMessages = [];
        mockCouncilStateMachine.state.playNextIndex = 0;

        render(<Council {...defaultProps} />);

        expect(defaultProps.setUnrecoverableError).toHaveBeenCalledWith(
            'Internal state mismatch: human_panelist state requires an awaiting_human_panelist message.'
        );
    });

    it('mounts HumanInput during warm phase (upcoming awaiting marker)', () => {
        mockCouncilStateMachine.state.councilState = 'playing';
        mockCouncilStateMachine.state.playingNowIndex = 0;
        mockCouncilStateMachine.state.textMessages = [
            { id: 'm1', type: 'message', speaker: 's1', text: 'hello' },
            { id: 'm2', type: 'awaiting_human_question', speaker: 'human', text: '' },
        ];

        render(<Council {...defaultProps} />);

        expect(screen.getByText('Human Input')).toBeInTheDocument();
    });

    it('does not mount HumanInput when next message is a regular speaker', () => {
        mockCouncilStateMachine.state.councilState = 'playing';
        mockCouncilStateMachine.state.playingNowIndex = 0;
        mockCouncilStateMachine.state.textMessages = [
            { id: 'm1', type: 'message', speaker: 's1', text: 'hello' },
            { id: 'm2', type: 'message', speaker: 's2', text: 'world' },
        ];

        render(<Council {...defaultProps} />);

        expect(screen.queryByText('Human Input')).not.toBeInTheDocument();
    });

    it('mounts HumanInput for human_input state (active phase)', () => {
        mockCouncilStateMachine.state.councilState = 'human_input';
        mockCouncilStateMachine.state.textMessages = [];

        render(<Council {...defaultProps} />);

        expect(screen.getByText('Human Input')).toBeInTheDocument();
    });

    it('unmounts meeting output when meta agent is active', async () => {
        mockMetaAgentActivate = true;
        mockUseCouncilSettings.mockReturnValue({
          isMuseumMode: true,
          mode: 'museum',
          setAppMode: vi.fn(),
          pushToTalkMode: true,
          setPushToTalkMode: vi.fn(),
        });

        render(<Council {...defaultProps} metaAgentActive={true} />);

        await waitFor(() => {
            expect(screen.queryByTestId('output')).not.toBeInTheDocument();
        });
    });
});
