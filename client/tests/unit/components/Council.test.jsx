import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Council from '../../../src/components/Council';
import io from 'socket.io-client';

// --- Mocks ---

// Mock Child Components to simplify testing (Shallow render approach)
// Mock Child Components to simplify testing (Shallow render approach)
vi.mock('../../../src/components/FoodItem', () => ({ default: () => <div data-testid="food-item">FoodItem</div> }));
vi.mock('../../../src/components/Overlay', () => ({ default: ({ children }) => <div data-testid="overlay">{children}</div> }));
vi.mock('../../../src/components/CouncilOverlays', () => ({
    default: ({ proceedWithHumanName, activeOverlay, onContinue, onWrapItUp }) => (
        <div data-testid="council-overlays">
            {activeOverlay === 'name' && (
                <button
                    data-testid="submit-name-btn"
                    onClick={() => proceedWithHumanName({ humanName: 'Test Human' })}
                >
                    Submit Name
                </button>
            )}
            {activeOverlay === 'completed' && (
                <button
                    data-testid="continue-btn"
                    onClick={onContinue}
                >
                    Continue
                </button>
            )}
            {activeOverlay === 'summary' && (
                <button
                    data-testid="wrap-up-btn"
                    onClick={onWrapItUp}
                >
                    Wrap Up
                </button>
            )}
        </div>
    )
}));
vi.mock('../../../src/components/Loading', () => ({ default: () => <div data-testid="loading-screen">Loading...</div> }));
vi.mock('../../../src/components/Output', () => ({ default: () => <div data-testid="output-component">Output</div> }));
vi.mock('../../../src/components/ConversationControls', () => ({
    default: ({ onRaiseHand }) => (
        <div data-testid="controls">
            <button data-testid="raise-hand-btn" onClick={onRaiseHand}>Raise Hand</button>
        </div>
    )
}));
vi.mock('../../../src/components/HumanInput', () => ({ default: () => <div data-testid="human-input">HumanInput</div> }));

// Mock useCouncilSocket
const mockSocket = {
    emit: vi.fn(),
    on: vi.fn(),
    disconnect: vi.fn(),
    io: { on: vi.fn() }
};

// We need to return a ref-like object (current: ...) because the component uses socketRef.current
// AND the hook returns { current: socket }. 
// WAIT, looking at Council.jsx: "const socketRef = useCouncilSocket(...)". 
// And usage: "socketRef.current.emit(...)".
// So useCouncilSocket returns a Ref object.

vi.mock('../../../src/hooks/useCouncilSocket', () => ({
    useCouncilSocket: ({ onMeetingStarted, onConversationUpdate, onAudioUpdate }) => {
        // We can expose these callbacks globally or via a side-channel if we want to trigger them from tests
        // For now, let's attach them to the mock object so we can call them in tests
        mockSocket.callbacks = { onMeetingStarted, onConversationUpdate, onAudioUpdate };
        return { current: mockSocket };
    }
}));

describe('Council Component', () => {
    // Tests...
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset callbacks
        mockSocket.callbacks = {};
    });

    const mockParticipants = [
        { id: 'banana', name: 'Banana', type: 'ai' },
        { id: 'apple', name: 'Apple', type: 'ai' }
    ];

    const defaultProps = {
        lang: 'en',
        topic: { prompt: 'Test Topic' },
        participants: mockParticipants,
        setUnrecoverableError: vi.fn(),
        setConnectionError: vi.fn(),
        connectionError: false
    };

    afterEach(() => {
        vi.clearAllMocks();
    });



    it('initializes in loading state and connects to socket', () => {
        render(
            <MemoryRouter>
                <Council {...defaultProps} />
            </MemoryRouter>
        );

        // check initialization
        expect(screen.getByTestId('loading-screen')).toBeInTheDocument();
        // Since we mock the HOOK, we check if the hook was called (implicit by render)
        // or check if render happened.
    });

    it('transitions to playing when text and audio are received', async () => {
        render(
            <MemoryRouter>
                <Council {...defaultProps} />
            </MemoryRouter>
        );

        // 1. Server sends confirmation of meeting start
        act(() => {
            if (mockSocket.callbacks && mockSocket.callbacks.onMeetingStarted) {
                mockSocket.callbacks.onMeetingStarted({ meeting_id: '123' });
            }
        });

        // 2. Server sends text conversation update
        const firstMessage = {
            id: 'msg1',
            type: 'ai',
            speaker: 'banana',
            text: 'Hello world'
        };

        act(() => {
            if (mockSocket.callbacks && mockSocket.callbacks.onConversationUpdate) {
                mockSocket.callbacks.onConversationUpdate([firstMessage]);
            }
        });

        // Still loading because audio is missing
        expect(screen.getByTestId('loading-screen')).toBeInTheDocument();

        // 3. Server sends audio update
        await act(async () => {
            if (mockSocket.callbacks && mockSocket.callbacks.onAudioUpdate) {
                await mockSocket.callbacks.onAudioUpdate({
                    id: 'msg1',
                    audio: new ArrayBuffer(10) // Mock audio buffer
                });
            }
        });

        // Now it should have found text AND audio, and transitioned to 'playing'
        // 'playing' state shows Output and hidden Loading
        // Wait for state update
        await waitFor(() => {
            expect(screen.queryByTestId('loading-screen')).not.toBeInTheDocument();
        });

        // Verify Output is visible (it is rendered unconditionally, but logic controls what it shows)
        // Check if Controls appear (only in 'playing'/'waiting')
        expect(screen.getByTestId('controls')).toBeInTheDocument();
    });

    it('handles raising hand with name entry', async () => {
        render(
            <MemoryRouter>
                <Council {...defaultProps} />
            </MemoryRouter>
        );

        // 1. Setup Playing State
        const firstMessage = { id: 'msg1', type: 'ai', speaker: 'banana', text: 'Msg1' };

        act(() => {
            if (mockSocket.callbacks.onMeetingStarted) mockSocket.callbacks.onMeetingStarted({ meeting_id: '123' });
            if (mockSocket.callbacks.onConversationUpdate) mockSocket.callbacks.onConversationUpdate([firstMessage]);
        });

        // Trigger Audio Update (Async inside component)
        await act(async () => {
            if (mockSocket.callbacks.onAudioUpdate) {
                await mockSocket.callbacks.onAudioUpdate({ id: 'msg1', audio: new ArrayBuffer(10) });
            }
        });

        // Wait for controls, meaning we are playing
        await waitFor(() => {
            expect(screen.getByTestId('controls')).toBeInTheDocument();
        });

        // 2. Click Raise Hand (No name set yet)
        const raiseHandBtn = screen.getByTestId('raise-hand-btn');
        act(() => {
            raiseHandBtn.click();
        });

        // 3. Verify Overlay appears (via our mock logic)
        await waitFor(() => {
            expect(screen.getByTestId('submit-name-btn')).toBeInTheDocument();
        });

        // 4. Submit Name
        const submitNameBtn = screen.getByTestId('submit-name-btn');
        act(() => {
            submitNameBtn.click();
        });

        // 5. Verify 'raise_hand' emission
        await waitFor(() => {
            expect(mockSocket.emit).toHaveBeenCalledWith('raise_hand', expect.objectContaining({
                humanName: 'Test Human',
                index: 1 // index of next message (0 + 1)
            }));
        });
    });

    it('handles raising hand', async () => {
        // Setup: Get into playing state
        render(
            <MemoryRouter>
                <Council {...defaultProps} />
            </MemoryRouter>
        );

        // Trigger playing state setup
        const firstMessage = { id: 'msg1', type: 'ai', speaker: 'banana', text: 'Msg1' };

        act(() => {
            if (mockSocket.callbacks.onConversationUpdate) mockSocket.callbacks.onConversationUpdate([firstMessage]);
        });

        await act(async () => {
            // Need audio too
            if (mockSocket.callbacks.onAudioUpdate) {
                await mockSocket.callbacks.onAudioUpdate({ id: 'msg1', audio: new ArrayBuffer(10) });
            }
        });

        await waitFor(() => {
            expect(screen.getByTestId('controls')).toBeInTheDocument();
        });

        // Click raise hand
        const raiseHandBtn = screen.getByTestId('raise-hand-btn');
        // We first need to check if user needs to enter name. 
        // Logic: if (humanName === "") setActiveOverlay("name");
        // So hitting the button should trigger overlay if no name set.

        act(() => {
            raiseHandBtn.click();
        });

        // Since we didn't set humanName, it should open overlay. 
        // We mocked CouncilOverlays, so we can't easily check internal state of overlay "name", 
        // but we can check if socket 'raise_hand' was emitted? 
        // NO, it shouldn't emit yet.
        expect(mockSocket.emit).not.toHaveBeenCalledWith('raise_hand', expect.anything());
    });

    // Let's test the "user already has a name" case for raise hand
    it('emits raise_hand if user name is already set', async () => {
        render(
            <MemoryRouter>
                <Council {...defaultProps} />
            </MemoryRouter>
        );

        // 1. Setup Playing State
        const firstMessage = { id: 'msg1', type: 'ai', speaker: 'banana', text: 'Msg1' };
        act(() => {
            if (mockSocket.callbacks.onConversationUpdate) mockSocket.callbacks.onConversationUpdate([firstMessage]);
        });
        await act(async () => {
            if (mockSocket.callbacks.onAudioUpdate) await mockSocket.callbacks.onAudioUpdate({ id: 'msg1', audio: new ArrayBuffer(10) });
        });
        await waitFor(() => { expect(screen.getByTestId('controls')).toBeInTheDocument(); });

        // 2. Click raise hand -> Submit Name
        const raiseHandBtn = screen.getByTestId('raise-hand-btn');
        act(() => { raiseHandBtn.click(); });
        await waitFor(() => { expect(screen.getByTestId('submit-name-btn')).toBeInTheDocument(); });
        const submitNameBtn = screen.getByTestId('submit-name-btn');
        act(() => { submitNameBtn.click(); });

        // 3. Verify 'raise_hand' triggered
        await waitFor(() => {
            expect(mockSocket.emit).toHaveBeenCalledWith('raise_hand', expect.anything());
        });
    });

    it('emits wrap_up_meeting when summary requested', async () => {
        render(<MemoryRouter><Council {...defaultProps} /></MemoryRouter>);

        // 1. Play first message
        const firstMessage = { id: 'msg1', type: 'ai', speaker: 'banana', text: 'Msg1' };
        act(() => {
            if (mockSocket.callbacks.onConversationUpdate) mockSocket.callbacks.onConversationUpdate([firstMessage]);
        });
        await act(async () => {
            if (mockSocket.callbacks.onAudioUpdate) await mockSocket.callbacks.onAudioUpdate({ id: 'msg1', audio: new ArrayBuffer(10) });
        });

        // 2. Receive Summary Message (type='summary')
        const summaryMessage = { id: 'summary', type: 'summary', text: 'Summary' };
        act(() => {
            if (mockSocket.callbacks.onConversationUpdate) mockSocket.callbacks.onConversationUpdate([summaryMessage]);
        });

        // 3. Click Wrap Up
        await waitFor(() => {
            expect(screen.getByTestId('wrap-up-btn')).toBeInTheDocument();
        });
        const wrapUpBtn = screen.getByTestId('wrap-up-btn');
        act(() => { wrapUpBtn.click(); });

        // 4. Verify Emission
        await waitFor(() => {
            expect(mockSocket.emit).toHaveBeenCalledWith('wrap_up_meeting', expect.any(Object));
        });
    });
});

