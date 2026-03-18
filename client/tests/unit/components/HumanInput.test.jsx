
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HumanInput from '../../../src/components/HumanInput';
import { useTranslation } from 'react-i18next';
import { useMobile } from '../../../src/utils';

// Mocks
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key) => key }),
}));

vi.mock('../../../src/utils', () => ({
    useMobile: vi.fn(),
    dvh: "vh",
    mapFoodIndex: (l, i) => i
}));

// Mock child components to avoid complex rendering issues
vi.mock('react-audio-visualize', () => ({
    LiveAudioVisualizer: () => <div data-testid="visualizer" />
}));

vi.mock('react-lottie-player', () => ({
    default: () => <div data-testid="lottie-loading" />
}));

vi.mock('../../../src/components/ConversationControlIcon', () => ({
    default: ({ icon, onClick }) => (
        <button data-testid={`icon-${icon}`} onClick={onClick}>{icon}</button>
    )
}));

describe('HumanInput Component', () => {
    let mockSocket;
    let mockOnSubmit;

    beforeEach(() => {
        mockSocket = {
            current: {
                emit: vi.fn(),
                on: vi.fn(),
                off: vi.fn(),
            }
        };
        mockOnSubmit = vi.fn();
        useMobile.mockReturnValue(false);
        global.fetch = vi.fn().mockResolvedValue({
            text: () => Promise.resolve("mock_sdp_answer")
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should render in idle state with mic icon', () => {
        render(
            <HumanInput
                foods={[]}
                isPanelist={false}
                currentSpeakerName="TestSpeaker"
                onSubmitHumanMessage={mockOnSubmit}
                socketRef={mockSocket}
            />
        );

        // Check for mic icon (idle state)
        expect(screen.getByTestId('icon-record_voice_off')).toBeInTheDocument();
        // Check textarea
        expect(screen.getByPlaceholderText('human.1')).toBeInTheDocument();
    });

    it('should request client key when component mounts', () => {
        render(
            <HumanInput
                foods={[]}
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                socketRef={mockSocket}
            />
        );
        expect(mockSocket.current.emit).toHaveBeenCalledWith('request_clientkey');
    });

    it('should handle text input and submission', () => {
        render(
            <HumanInput
                foods={[]}
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                socketRef={mockSocket}
            />
        );

        const textarea = screen.getByPlaceholderText('human.1');

        // Simulate typing
        fireEvent.change(textarea, { target: { value: 'Hello World' } });
        expect(textarea.value).toBe('Hello World');

        // Check that send icon appears (canContinue becomes true)
        const sendButton = screen.getByTestId('icon-send_message');
        expect(sendButton).toBeInTheDocument();

        // Click send
        fireEvent.click(sendButton);

        expect(mockOnSubmit).toHaveBeenCalledWith('Hello World', '');
    });

    it('should handle recording flow (click mic -> loading -> recording -> stop)', async () => {
        // Mock socket.on to simulate receiving client key immediately
        mockSocket.current.on.mockImplementation((event, callback) => {
            if (event === 'clientkey_response') {
                callback({ value: 'secret_key' });
            }
        });

        const { rerender } = render(
            <HumanInput
                foods={[]}
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                socketRef={mockSocket}
            />
        );

        // Click Mic
        const micBtn = screen.getByTestId('icon-record_voice_off');
        fireEvent.click(micBtn);

        // Should go to 'loading' state
        expect(screen.getByTestId('lottie-loading')).toBeInTheDocument();

        // Wait for effect to trigger startRealtimeSession -> sets state to 'recording'
        // This relies on the mocked getUserMedia and RTCPeerConnection usually resolving tick by tick

        // We need to wait for the visualizer to appear which indicates 'recording' state
        await waitFor(() => {
            const visualizers = screen.getAllByTestId('visualizer');
            expect(visualizers.length).toBeGreaterThan(0);
        });

        // Now button should be 'record_voice_on' (STOP button)
        const stopBtn = screen.getByTestId('icon-record_voice_on');

        // Click Stop
        fireEvent.click(stopBtn);

        // Should go back to idle
        expect(screen.getByTestId('icon-record_voice_off')).toBeInTheDocument();
    });

    it('should show panelist-specific placeholder when isPanelist is true', () => {
        render(
            <HumanInput
                foods={[]}
                isPanelist={true}
                currentSpeakerName="Mr. Potato"
                onSubmitHumanMessage={mockOnSubmit}
                socketRef={mockSocket}
            />
        );
        expect(screen.getByPlaceholderText('human.panelist')).toBeInTheDocument();
        // Note: mock implementation of useTranslation returns the key, so 'human.panelist'.
        // The real component substitutes {name}, but our mock returns key.
        // Wait, the mock in line 10 is: t: (key) => key.
        // So for t('human.panelist', { name: ... }) it returns 'human.panelist'.
    });

    it('should select and deselect a specific food to ask (askParticular)', () => {
        const foods = [{ name: 'Tomato' }, { name: 'Potato' }];
        render(
            <HumanInput
                foods={foods}
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                socketRef={mockSocket}
            />
        );

        // Find ring items (we rely on class "ringHover" or structure)
        // The code has <div className="ringHover" ... onClick={() => setAskParticular(food.name)}>
        // Let's rely on firing clicks on ring items. Since they don't have text, we might need a testid or selector.
        // But we didn't add testids to the rings in the component.
        // We can inspect the DOM structure in the component:
        // {foods.map((food, index) => ( <div className="ringHover" ... /> ))}

        const ringItems = document.getElementsByClassName('ringHover');
        expect(ringItems.length).toBe(2);

        // Interact with first item (Tomato)
        fireEvent.click(ringItems[0]);

        // Now type and submit
        const textarea = screen.getByPlaceholderText('human.1');
        fireEvent.change(textarea, { target: { value: 'Question for Tomato' } });
        const sendButton = screen.getByTestId('icon-send_message');
        fireEvent.click(sendButton);

        expect(mockOnSubmit).toHaveBeenCalledWith('Question for Tomato', 'Tomato');
    });

    it('should NOT submit on Shift+Enter', () => {
        render(
            <HumanInput
                foods={[]}
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                socketRef={mockSocket}
            />
        );
        const textarea = screen.getByPlaceholderText('human.1');

        // Type something so submission is enabled
        fireEvent.change(textarea, { target: { value: 'Line 1' } });

        // Press Shift+Enter
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

        expect(mockOnSubmit).not.toHaveBeenCalled();

        // Press Enter (no shift)
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
        expect(mockOnSubmit).toHaveBeenCalledWith('Line 1', '');
    });

    it('should enforce max input length', () => {
        render(
            <HumanInput
                foods={[]}
                isPanelist={false} // max 700
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                socketRef={mockSocket}
            />
        );
        const textarea = screen.getByPlaceholderText('human.1');
        expect(textarea).toHaveAttribute('maxLength', '700');

        // Re-render as panelist
        // (Cleanest to just make a new test or unmount, but simplified here)
    });
});
