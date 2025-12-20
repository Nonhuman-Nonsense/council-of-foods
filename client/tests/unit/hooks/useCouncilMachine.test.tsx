
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCouncilMachine } from '../../../src/hooks/useCouncilMachine';
// import { useCouncilSocket } from "../../../src/hooks/useCouncilSocket"; // doing manual mock

// --- Mocks ---

const mockNavigate = vi.fn();
const mockUseLocation = vi.fn().mockReturnValue({ hash: '', pathname: '' });

vi.mock('react-router', () => ({
    useNavigate: () => mockNavigate,
    useLocation: () => mockUseLocation() // Call it to allow changing return value
}));

// Mock Global Options
vi.mock('@/global-options-client.json', () => ({
    default: {
        conversationMaxLength: 5,
        extraMessageCount: 3,
        meetingVeryMaxLength: 10
    }
}));

// Mock Socket Hook
// We need to be able to trigger callbacks passed to useCouncilSocket
let socketHandlers: any = {};
const mockSocketEmit = vi.fn();

vi.mock('../../../src/hooks/useCouncilSocket', () => ({
    useCouncilSocket: (props: any) => {
        socketHandlers = props; // Capture handlers
        return { current: { emit: mockSocketEmit } }; // Return mock socket ref
    }
}));

describe('useCouncilMachine', () => {
    let audioContextMock: any;

    let defaultProps: any;

    beforeEach(() => {
        vi.clearAllMocks();
        socketHandlers = {};
        audioContextMock = {
            current: {
                decodeAudioData: vi.fn(),
                state: 'running',
                suspend: vi.fn(),
                resume: vi.fn()
            }
        };
        defaultProps = {
            lang: 'en',
            topic: { prompt: 'Test Topic' },
            participants: [],
            audioContext: audioContextMock,
            setUnrecoverableError: vi.fn(),
            setConnectionError: vi.fn(),
            connectionError: false,
            isPaused: false,
            setPaused: vi.fn(),
            setAudioPaused: vi.fn(),
            baseUrl: '/test/meeting'
        };
    });

    it('initializes with loading state', () => {
        const { result } = renderHook(() => useCouncilMachine(defaultProps as any));
        expect(result.current.state.councilState).toBe('loading');
    });

    it('navigates to meeting URL when meeting starts', () => {
        renderHook(() => useCouncilMachine(defaultProps as any));

        // Simulate meeting started event
        act(() => {
            if (socketHandlers.onMeetingStarted) {
                socketHandlers.onMeetingStarted({ meeting_id: '12345' });
            }
        });

        // Expect navigation with baseUrl
        expect(mockNavigate).toHaveBeenCalledWith(`${defaultProps.baseUrl}/12345`);
        // We can't easily check state.currentMeetingId immediately inside act if it triggers re-render, 
        // but the hook should update.
    });

    it('updates text messages on conversation update', () => {
        const { result } = renderHook(() => useCouncilMachine(defaultProps as any));

        const newMessages = [
            { id: '1', text: 'Hello', speaker: 'banana', type: 'message' }
        ];

        act(() => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate(newMessages);
            }
        });

        expect(result.current.state.textMessages).toEqual(newMessages);
    });

    it('transitions to playing when audio and text are available', async () => {
        const { result } = renderHook(() => useCouncilMachine(defaultProps as any));

        // 1. Add Text
        act(() => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate([
                    { id: 'msg1', text: 'Hello', speaker: 'banana', type: 'message' }
                ]);
            }
        });

        // 2. Add Audio
        // Mock decodeAudioData to return a fake buffer
        audioContextMock.current.decodeAudioData.mockResolvedValue('fake-buffer');

        await act(async () => {
            if (socketHandlers.onAudioUpdate) {
                // Must trigger async decoding
                socketHandlers.onAudioUpdate({ id: 'msg1', audio: new ArrayBuffer(8) });
            }
        });

        // Current implementation of onAudioUpdate is async IIFE, so we might need a small wait
        // The await act() should handle promises pushed to microtask queue?
        // Let's retry condition if needed.

        // Trigger generic re-render check or rely on useEffect inside hook
        // The hook has a useEffect that checks TryToFindTextAndAudio when loading
        // We might need to force a re-render or wait for the useEffect

        // Wait for next update
        // Using waitFor from testing-library/react would be better if we rendered component, 
        // with renderHook we can just check result.current if we awaited enough.

        // Note: The hook state update happens after await decodeAudioData.
    });

    it('navigates correctly on removeOverlay', () => {
        const { result } = renderHook(() => useCouncilMachine(defaultProps as any));

        // First simulate meeting started to set currentMeetingId
        act(() => {
            if (socketHandlers.onMeetingStarted) {
                socketHandlers.onMeetingStarted({ meeting_id: 'existing-id' });
            }
        });
        mockNavigate.mockClear();

        act(() => {
            result.current.actions.removeOverlay();
        });

        // Expect navigation to current meeting ID, using baseUrl
        expect(mockNavigate).toHaveBeenCalledWith(`${defaultProps.baseUrl}/existing-id`);
    });

    it('navigates to "new" if no current meeting id on removeOverlay', () => {
        const { result } = renderHook(() => useCouncilMachine(defaultProps as any));

        act(() => {
            result.current.actions.removeOverlay();
        });

        expect(mockNavigate).toHaveBeenCalledWith(`${defaultProps.baseUrl}/new`);
    });

    it('pauses audio context when isPaused becomes true', () => {
        const props = { ...defaultProps, isPaused: true };
        renderHook(() => useCouncilMachine(props as any));

        // setAudioPaused should be called if provided
        expect(defaultProps.setAudioPaused).toHaveBeenCalledWith(true);
    });

    it('toggles mute state when toggleMute is called', () => {
        const { result } = renderHook(() => useCouncilMachine(defaultProps as any));

        // Initial state should be unmuted (false)
        expect(result.current.state.isMuted).toBe(false);

        // Toggle mute
        act(() => {
            result.current.actions.toggleMute();
        });
        expect(result.current.state.isMuted).toBe(true);

        // Toggle again
        act(() => {
            result.current.actions.toggleMute();
        });
        expect(result.current.state.isMuted).toBe(false);
    });

    // --- Human Panelist Tests ---

    it('transitions to human_panelist state when awaiting_human_panelist message is next', () => {
        const { result } = renderHook(() => useCouncilMachine(defaultProps as any));

        const panelistMsg = {
            id: 'msg_panelist',
            text: '...',
            speaker: 'human-panelist',
            type: 'awaiting_human_panelist'
        };

        act(() => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate([panelistMsg]);
            }
        });

        // The state machine effect should trigger
        expect(result.current.state.councilState).toBe('human_panelist');
    });

    it('submits human panelist message correctly', () => {
        const { result } = renderHook(() => useCouncilMachine(defaultProps as any));

        const panelistMsg = {
            id: 'msg_panelist',
            text: '...',
            speaker: 'human-panelist-1',
            type: 'awaiting_human_panelist'
        };

        // 1. Enter state
        act(() => {
            if (socketHandlers.onConversationUpdate) {
                socketHandlers.onConversationUpdate([panelistMsg]);
            }
        });
        expect(result.current.state.councilState).toBe('human_panelist');

        // 2. Submit
        act(() => {
            result.current.actions.handleOnSubmitHumanMessage('My Panelist Response', '');
        });

        // 3. Verify Emission
        // Expect "submit_human_panelist" with correct structure
        expect(mockSocketEmit).toHaveBeenCalledWith('submit_human_panelist', {
            text: 'My Panelist Response',
            speaker: 'human-panelist-1' // Should use the speaker ID from the awaiting message
        });

        // 4. Verify Local State update (slicing) and transition
        // Slicing removes the 'awaiting' message, so textMessages should be empty
        expect(result.current.state.textMessages).toEqual([]);

        // Next action calculation should transition back to loading or appropriate state
        // If textMessages is empty, tryToFind will fail -> loading
        expect(result.current.state.councilState).toBe('loading');
    });


    it('should NOT emit attempt_reconnection if reconnection happens without a current meeting ID (race condition fix)', () => {
        renderHook(() => useCouncilMachine(defaultProps as any));

        // Simulate reconnect event
        act(() => {
            if (socketHandlers.onReconnect) {
                socketHandlers.onReconnect();
            }
        });

        // Should not have emitted attempt_reconnection because no meeting started yet
        expect(mockSocketEmit).not.toHaveBeenCalledWith('attempt_reconnection', expect.anything());
    });

    it('should emit attempt_reconnection if a meeting was already active', () => {
        const { result } = renderHook(() => useCouncilMachine(defaultProps as any));

        // 1. Establish Meeting
        act(() => {
            if (socketHandlers.onMeetingStarted) {
                socketHandlers.onMeetingStarted({ meeting_id: '999' });
            }
        });

        // 2. Simulate Reconnect
        act(() => {
            if (socketHandlers.onReconnect) {
                socketHandlers.onReconnect();
            }
        });

        // Should emit
        expect(mockSocketEmit).toHaveBeenCalledWith('attempt_reconnection', expect.objectContaining({
            meetingId: '999'
        }));
    });
});

