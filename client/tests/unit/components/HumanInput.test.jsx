
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import HumanInput from '@council/humanInput/HumanInput';
import { useMobile } from '@/utils';
import { bootstrapHumanInputRealtimeSession } from '@api/realtimeSession';
import { createRealtimeConnection } from '@/realtime/realtimeConnection';

// Mocks
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key) => key, i18n: { language: 'en' } }),
}));

vi.mock('@/utils', () => ({
    useMobile: vi.fn(),
    dvh: "vh",
    mapFoodIndex: (l, i) => i
}));

vi.mock('@api/realtimeSession', () => ({
    bootstrapHumanInputRealtimeSession: vi.fn(),
}));

vi.mock('@/realtime/realtimeConnection', () => ({
    createRealtimeConnection: vi.fn(),
}));

// Mock child components to avoid complex rendering issues
vi.mock('@council/humanInput/LiveAudioVisualizer', () => ({
    LiveAudioVisualizerPair: () => <div data-testid="visualizer" />
}));

vi.mock('react-lottie-player', () => ({
    default: () => <div data-testid="lottie-loading" />
}));

vi.mock('@council/ConversationControlIcon', () => ({
    default: ({ icon, onClick }) => (
        <button data-testid={`icon-${icon}`} onClick={onClick}>{icon}</button>
    )
}));

describe('HumanInput Component', () => {
    let mockOnSubmit;

    beforeEach(() => {
        mockOnSubmit = vi.fn();
        useMobile.mockReturnValue(false);
        bootstrapHumanInputRealtimeSession.mockResolvedValue({
            provider: 'inworld',
            iceServers: [],
            session: { type: 'realtime' },
        });
        createRealtimeConnection.mockResolvedValue({
            pc: {},
            dc: {},
            micStream: { id: 'mock-stream' },
            close: vi.fn(),
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should render in idle state with mic icon', () => {
        render(
            <HumanInput
                isPanelist={false}
                currentSpeakerName="TestSpeaker"
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
            />
        );

        // Check for mic icon (idle state)
        expect(screen.getByTestId('icon-record_voice_off')).toBeInTheDocument();
        // Check textarea
        expect(screen.getByPlaceholderText('human.1')).toBeInTheDocument();
    });

    it('should not bootstrap a realtime session until recording starts', () => {
        render(
            <HumanInput
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
            />
        );
        expect(bootstrapHumanInputRealtimeSession).not.toHaveBeenCalled();
    });

    it('should handle text input and submission', () => {
        render(
            <HumanInput
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
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

        expect(mockOnSubmit).toHaveBeenCalledWith('Hello World');
    });

    it('should handle recording flow (click mic -> loading -> recording -> stop)', async () => {
        render(
            <HumanInput
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
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

        expect(bootstrapHumanInputRealtimeSession).toHaveBeenCalledWith(
            { feature: 'human-input', language: 'en' },
            'test-key',
            expect.any(AbortSignal)
        );
        expect(createRealtimeConnection).toHaveBeenCalledWith(
            expect.objectContaining({
                callPath: '/api/realtime/call',
                callBodyExtras: { feature: 'human-input', provider: 'inworld' },
                onOpen: expect.any(Function),
            })
        );

        // Now button should be 'record_voice_on' (STOP button)
        const stopBtn = screen.getByTestId('icon-record_voice_on');

        // Click Stop
        fireEvent.click(stopBtn);

        // Should go back to idle
        expect(screen.getByTestId('icon-record_voice_off')).toBeInTheDocument();
    });

    it('should send session.update on data channel open for Inworld human input', async () => {
        const send = vi.fn();
        createRealtimeConnection.mockImplementation(async (opts) => {
            if (opts.onOpen) opts.onOpen({ dc: { send } });
            return { pc: {}, dc: { send }, micStream: {}, close: vi.fn() };
        });

        render(
            <HumanInput
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
            />
        );

        fireEvent.click(screen.getByTestId('icon-record_voice_off'));

        await waitFor(() => {
            expect(send).toHaveBeenCalled();
        });

        const payload = JSON.parse(send.mock.calls[0][0]);
        expect(payload).toEqual({
            type: 'session.update',
            session: { type: 'realtime' },
        });
    });

    it('should not register onOpen for OpenAI human-input bootstrap', async () => {
        bootstrapHumanInputRealtimeSession.mockResolvedValue({
            provider: 'openai',
            iceServers: [],
            session: { type: 'transcription', audio: {} },
        });

        render(
            <HumanInput
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
            />
        );

        fireEvent.click(screen.getByTestId('icon-record_voice_off'));

        await waitFor(() => {
            expect(createRealtimeConnection).toHaveBeenCalled();
        });

        const opts = createRealtimeConnection.mock.calls[0][0];
        expect(opts.onOpen).toBeUndefined();
    });

    it('should show panelist-specific placeholder when isPanelist is true', () => {
        render(
            <HumanInput
                isPanelist={true}
                currentSpeakerName="Mr. Potato"
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
            />
        );
        expect(screen.getByPlaceholderText('human.panelist')).toBeInTheDocument();
    });

    it('should submit text input without manual character targeting', () => {
        render(
            <HumanInput
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
            />
        );

        const textarea = screen.getByPlaceholderText('human.1');
        fireEvent.change(textarea, { target: { value: 'Question for the council' } });
        const sendButton = screen.getByTestId('icon-send_message');
        fireEvent.click(sendButton);

        expect(mockOnSubmit).toHaveBeenCalledWith('Question for the council');
    });

    it('should NOT submit on Shift+Enter', () => {
        render(
            <HumanInput
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
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
        expect(mockOnSubmit).toHaveBeenCalledWith('Line 1');
    });

    it('should enforce max input length', () => {
        render(
            <HumanInput
                isPanelist={false} // max 700
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
            />
        );
        const textarea = screen.getByPlaceholderText('human.1');
        expect(textarea).toHaveAttribute('maxLength', '700');
    });
});
