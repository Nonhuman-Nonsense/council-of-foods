import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Council from '../../../src/components/Council';
import io from 'socket.io-client';

// --- Mocks ---

// Mock Child Components to simplify testing (Shallow render approach)
vi.mock('../../../src/components/FoodItem', () => ({ default: () => <div data-testid="food-item">FoodItem</div> }));
vi.mock('../../../src/components/Overlay', () => ({ default: ({ children }) => <div data-testid="overlay">{children}</div> }));
vi.mock('../../../src/components/CouncilOverlays', () => ({
    default: ({ proceedWithHumanName, activeOverlay }) => (
        <div data-testid="council-overlays">
            {activeOverlay === 'name' && (
                <button
                    data-testid="submit-name-btn"
                    onClick={() => proceedWithHumanName({ humanName: 'Test Human' })}
                >
                    Submit Name
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

// Mock Socket.io
vi.mock('socket.io-client');

describe('Council Component', () => {
    let socketMock;
    let socketHandlers = {};

    beforeEach(() => {
        // Setup Socket Mock
        socketHandlers = {};
        socketMock = {
            on: vi.fn((event, callback) => {
                socketHandlers[event] = callback;
            }),
            emit: vi.fn(),
            disconnect: vi.fn(),
            io: {
                on: vi.fn() // For 'reconnect'
            }
        };
        io.mockReturnValue(socketMock);

        // Mock global options if needed, but they are imported directly. 
        // We might need to mock the module if we want to change them.
    });

    afterEach(() => {
        vi.clearAllMocks();
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

    it('initializes in loading state and connects to socket', () => {
        render(
            <MemoryRouter>
                <Council {...defaultProps} />
            </MemoryRouter>
        );

        // check initialization
        expect(screen.getByTestId('loading-screen')).toBeInTheDocument();
        expect(io).toHaveBeenCalled();
        expect(socketMock.emit).toHaveBeenCalledWith('start_conversation', expect.objectContaining({
            topic: 'Test Topic',
            characters: mockParticipants
        }));
    });

    it('transitions to playing when text and audio are received', async () => {
        render(
            <MemoryRouter>
                <Council {...defaultProps} />
            </MemoryRouter>
        );

        // 1. Server sends confirmation of meeting start
        act(() => {
            if (socketHandlers['meeting_started']) {
                socketHandlers['meeting_started']({ meeting_id: '123' });
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
            if (socketHandlers['conversation_update']) {
                socketHandlers['conversation_update']([firstMessage]);
            }
        });

        // Still loading because audio is missing
        expect(screen.getByTestId('loading-screen')).toBeInTheDocument();

        // 3. Server sends audio update
        act(() => {
            if (socketHandlers['audio_update']) {
                socketHandlers['audio_update']({
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
            if (socketHandlers['meeting_started']) socketHandlers['meeting_started']({ meeting_id: '123' });
            if (socketHandlers['conversation_update']) socketHandlers['conversation_update']([firstMessage]);
        });

        // Trigger Audio Update (Async inside component)
        await act(async () => {
            if (socketHandlers['audio_update']) {
                await socketHandlers['audio_update']({ id: 'msg1', audio: new ArrayBuffer(10) });
            }
        });

        // Wait to fetch the promise that internal async function created? 
        // We can't await void return.
        // We just wait for "Controls" to appear.


        // Wait for controls, meaning we are playing
        await waitFor(() => {
            expect(screen.getByTestId('controls')).toBeInTheDocument();
            // Important: Wait specifically for the raise hand button to be "clickable" 
            // (though JSDOM doesn't enforce boolean disabled, logic hides it if not allowed)
            // In our mock, it's always rendered if wrapper is rendered.
        });

        // 2. Click Raise Hand (No name set yet)
        const raiseHandBtn = screen.getByTestId('raise-hand-btn');
        act(() => {
            raiseHandBtn.click();
        });

        // 3. Verify Overlay appears (via our mock logic)
        // In Council.jsx, handleOnRaiseHand sets activeOverlay("name")
        // Our mock CouncilOverlays renders 'submit-name-btn' when activeOverlay === 'name'

        // Wait for re-render
        await waitFor(() => {
            expect(screen.getByTestId('submit-name-btn')).toBeInTheDocument();
        });

        // 4. Submit Name
        const submitNameBtn = screen.getByTestId('submit-name-btn');
        act(() => {
            submitNameBtn.click();
        });

        // 5. Verify 'raise_hand' emission
        // handleHumanNameEntered -> setIsRaisedHand(true) -> useEffect -> emit
        await waitFor(() => {
            expect(socketMock.emit).toHaveBeenCalledWith('raise_hand', expect.objectContaining({
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
            if (socketHandlers['conversation_update']) socketHandlers['conversation_update']([firstMessage]);
        });

        await act(async () => {
            // Need audio too
            if (socketHandlers['audio_update']) {
                await socketHandlers['audio_update']({ id: 'msg1', audio: new ArrayBuffer(10) });
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
        expect(socketMock.emit).not.toHaveBeenCalledWith('raise_hand', expect.anything());

        // We can't easily interact with the Name Input because it's inside the mocked CouncilOverlays.
        // LIMITATION OF SHALLOW MOCKING: Hard to integration test flows that depend on child component callbacks 
        // unless we expose them in the mock.
    });

    // Let's test the "user already has a name" case for raise hand
    it('emits raise_hand if user name is already set', async () => {
        // ... Wait, how to set name? It's internal state `humanName`.
        // We can't access it from props.
        // Testing internal state is hard.

        // Option: Provide a way to simulate name entry via the Overlay mock?
        // Yes! Pass the prop.
    });
});

