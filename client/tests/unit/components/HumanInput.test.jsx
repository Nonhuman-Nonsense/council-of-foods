
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HumanInput from '../../../src/components/HumanInput';
import { useMobile } from '../../../src/utils';
import { getClientKey } from '../../../src/api/getClientKey';

// Mocks
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key) => key, i18n: { language: 'en' } }),
}));

vi.mock('../../../src/utils', () => ({
    useMobile: vi.fn(),
    dvh: "vh",
    mapFoodIndex: (l, i) => i
}));

vi.mock('../../../src/api/getClientKey', () => ({
    getClientKey: vi.fn(),
}));

// Mock child components to avoid complex rendering issues
vi.mock('../../../src/components/LiveAudioVisualizer', () => ({
    LiveAudioVisualizerPair: () => <div data-testid="visualizer" />
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
    let mockOnSubmit;

    beforeEach(() => {
        mockOnSubmit = vi.fn();
        useMobile.mockReturnValue(false);
        getClientKey.mockResolvedValue({ value: 'mock_client_key' });
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
                creatorKey="test-key"
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
                creatorKey="test-key"
            />
        );
        expect(getClientKey).toHaveBeenCalledWith({ language: 'en', creatorKey: 'test-key' });
    });

    it('should handle text input and submission', () => {
        render(
            <HumanInput
                foods={[]}
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                creatorKey="test-key"
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
        render(
            <HumanInput
                foods={[]}
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                creatorKey="test-key"
            />
        );

        // Wait for client key to be fetched
        await waitFor(() => {
            expect(getClientKey).toHaveBeenCalled();
        });

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
                creatorKey="test-key"
            />
        );
        expect(screen.getByPlaceholderText('human.panelist')).toBeInTheDocument();
    });

    it.skip('should select and deselect a specific food to ask (askParticular)', async () => {
        const foods = [{ name: 'Tomato' }, { name: 'Potato' }];
        render(
            <HumanInput
                foods={foods}
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                creatorKey="test-key"
            />
        );

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
                creatorKey="test-key"
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
                creatorKey="test-key"
            />
        );
        const textarea = screen.getByPlaceholderText('human.1');
        expect(textarea).toHaveAttribute('maxLength', '700');
    });
});
