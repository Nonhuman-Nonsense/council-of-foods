
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

function createMockMicStream(tracks = null) {
    const audioTracks = tracks ?? [{ enabled: true }];
    return {
        id: 'mock-stream',
        getAudioTracks: () => audioTracks,
    };
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

/** Renders HumanInput in active phase and waits for the auto-connect to complete. */
async function renderAndWaitReady(extraProps = {}) {
    const result = render(
        <HumanInput
            phase="active"
            isPanelist={false}
            currentSpeakerName=""
            onSubmitHumanMessage={vi.fn()}
            liveKey="test-key"
            {...extraProps}
        />
    );
    await waitFor(() => {
        expect(screen.getByTestId('icon-record_voice_off')).toBeInTheDocument();
    });
    return result;
}

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
            micStream: createMockMicStream(),
            close: vi.fn(),
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    // ── Phase: warm vs active ──────────────────────────────────────────────────

    it('should return null (no UI) during warm phase, but still connect', async () => {
        render(
            <HumanInput
                phase="warm"
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
            />
        );

        // No visible UI
        expect(screen.queryByPlaceholderText('human.1')).not.toBeInTheDocument();

        // But the connection still started
        await waitFor(() => {
            expect(bootstrapHumanInputRealtimeSession).toHaveBeenCalledWith(
                { feature: 'human-input', language: 'en' },
                'test-key',
                expect.any(AbortSignal)
            );
        });
    });

    it('should auto-connect on mount and show loading until ready', async () => {
        // Make the connection slow so we can observe the loading state
        const pending = deferred();
        createRealtimeConnection.mockReturnValue(pending.promise);

        render(
            <HumanInput
                phase="active"
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
            />
        );

        // Should be in connecting state (lottie shown, no mic button)
        expect(screen.getByTestId('lottie-loading')).toBeInTheDocument();
        expect(screen.queryByTestId('icon-record_voice_off')).not.toBeInTheDocument();

        // Resolve the connection
        pending.resolve({ pc: {}, dc: {}, micStream: createMockMicStream(), close: vi.fn() });

        await waitFor(() => {
            expect(screen.getByTestId('icon-record_voice_off')).toBeInTheDocument();
        });
    });

    it('should bootstrap on mount, not waiting for recording to start', async () => {
        render(
            <HumanInput
                phase="active"
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
            />
        );

        await waitFor(() => {
            expect(bootstrapHumanInputRealtimeSession).toHaveBeenCalledTimes(1);
        });
    });

    it('should disable the mic track after pre-warm connect', async () => {
        const track = { enabled: true };
        const micStream = createMockMicStream([track]);
        createRealtimeConnection.mockResolvedValue({
            pc: {},
            dc: {},
            micStream,
            close: vi.fn(),
        });

        await renderAndWaitReady();

        // Track should be gated (disabled) after connect
        expect(track.enabled).toBe(false);
    });

    // ── Text input and submission ──────────────────────────────────────────────

    it('should handle text input and submission', async () => {
        await renderAndWaitReady({ onSubmitHumanMessage: mockOnSubmit });

        const textarea = screen.getByPlaceholderText('human.1');
        fireEvent.change(textarea, { target: { value: 'Hello World' } });
        expect(textarea.value).toBe('Hello World');

        const sendButton = screen.getByTestId('icon-send_message');
        expect(sendButton).toBeInTheDocument();

        fireEvent.click(sendButton);
        expect(mockOnSubmit).toHaveBeenCalledWith('Hello World');
    });

    it('should submit text without manual character targeting', async () => {
        await renderAndWaitReady({ onSubmitHumanMessage: mockOnSubmit });

        const textarea = screen.getByPlaceholderText('human.1');
        fireEvent.change(textarea, { target: { value: 'Question for the council' } });
        fireEvent.click(screen.getByTestId('icon-send_message'));

        expect(mockOnSubmit).toHaveBeenCalledWith('Question for the council');
    });

    it('should submit on Enter but not on Shift+Enter', async () => {
        await renderAndWaitReady({ onSubmitHumanMessage: mockOnSubmit });

        const textarea = screen.getByPlaceholderText('human.1');
        fireEvent.change(textarea, { target: { value: 'Line 1' } });

        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
        expect(mockOnSubmit).not.toHaveBeenCalled();

        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
        expect(mockOnSubmit).toHaveBeenCalledWith('Line 1');
    });

    it('should enforce max input length', async () => {
        await renderAndWaitReady();
        const textarea = screen.getByPlaceholderText('human.1');
        expect(textarea).toHaveAttribute('maxLength', '10000');
    });

    // ── Recording flow ─────────────────────────────────────────────────────────

    it('should handle recording flow: ready → recording → stop → ready', async () => {
        await renderAndWaitReady({ onSubmitHumanMessage: mockOnSubmit });

        // Click mic → enable track → recording
        const micBtn = screen.getByTestId('icon-record_voice_off');
        fireEvent.click(micBtn);

        await waitFor(() => {
            expect(screen.getByTestId('icon-record_voice_on')).toBeInTheDocument();
        });

        // Click stop → no audio active → goes straight to ready
        fireEvent.click(screen.getByTestId('icon-record_voice_on'));

        expect(screen.getByTestId('icon-record_voice_off')).toBeInTheDocument();
    });

    it('should show the visualizer while recording', async () => {
        await renderAndWaitReady();

        fireEvent.click(screen.getByTestId('icon-record_voice_off'));

        await waitFor(() => {
            expect(screen.getAllByTestId('visualizer').length).toBeGreaterThan(0);
        });
    });

    it('should enable the mic track when recording starts', async () => {
        const track = { enabled: true };
        createRealtimeConnection.mockResolvedValue({
            pc: {},
            dc: {},
            micStream: createMockMicStream([track]),
            close: vi.fn(),
        });

        await renderAndWaitReady();

        // Track disabled after connect
        expect(track.enabled).toBe(false);

        fireEvent.click(screen.getByTestId('icon-record_voice_off'));

        await waitFor(() => {
            expect(screen.getByTestId('icon-record_voice_on')).toBeInTheDocument();
        });

        // Track re-enabled when recording
        expect(track.enabled).toBe(true);
    });

    it('should stop recording when the textarea receives focus', async () => {
        await renderAndWaitReady();

        fireEvent.click(screen.getByTestId('icon-record_voice_off'));

        await waitFor(() => {
            expect(screen.getByTestId('icon-record_voice_on')).toBeInTheDocument();
        });

        fireEvent.focus(screen.getByPlaceholderText('human.1'));

        expect(screen.getByTestId('icon-record_voice_off')).toBeInTheDocument();
    });

    // ── Inworld session.update ─────────────────────────────────────────────────

    it('should send session.update on data channel open for Inworld human input', async () => {
        const send = vi.fn();
        createRealtimeConnection.mockImplementation(async (opts) => {
            if (opts.onOpen) opts.onOpen({ dc: { send } });
            return { pc: {}, dc: { send }, micStream: createMockMicStream(), close: vi.fn() };
        });

        await renderAndWaitReady();

        expect(send).toHaveBeenCalled();
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

        await renderAndWaitReady();

        const opts = createRealtimeConnection.mock.calls[0][0];
        expect(opts.onOpen).toBeUndefined();
    });

    // ── Error handling ─────────────────────────────────────────────────────────

    it('should ignore AbortError during startup without logging an error', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        createRealtimeConnection.mockRejectedValue(
            Object.assign(new Error('aborted'), { name: 'AbortError' })
        );

        render(
            <HumanInput
                phase="active"
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
            />
        );

        await waitFor(() => {
            expect(createRealtimeConnection).toHaveBeenCalled();
        });

        expect(consoleError).not.toHaveBeenCalled();
        // Stays in loading (idle loop) — lottie is visible
        expect(screen.getByTestId('lottie-loading')).toBeInTheDocument();
    });

    it('should surface non-abort startup failures and auto-retry', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        createRealtimeConnection
            .mockRejectedValueOnce(new Error('network blew up'))
            .mockResolvedValue({ pc: {}, dc: {}, micStream: createMockMicStream(), close: vi.fn() });

        render(
            <HumanInput
                phase="active"
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
            />
        );

        // First attempt fails, error logged
        await waitFor(() => {
            expect(consoleError).toHaveBeenCalledWith(
                'Failed to start realtime human input session',
                expect.any(Error)
            );
        });

        // Auto-retry succeeds → ready
        await waitFor(() => {
            expect(screen.getByTestId('icon-record_voice_off')).toBeInTheDocument();
        });
    });

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    it('should close the connection on unmount', async () => {
        const close = vi.fn();
        createRealtimeConnection.mockResolvedValue({
            pc: {},
            dc: {},
            micStream: createMockMicStream(),
            close,
        });

        const { unmount } = await renderAndWaitReady();
        unmount();

        expect(close).toHaveBeenCalled();
    });

    it('should close a connection that resolves after the component unmounts', async () => {
        const pending = deferred();
        const close = vi.fn();
        createRealtimeConnection.mockReturnValue(pending.promise);

        const { unmount } = render(
            <HumanInput
                phase="active"
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
            />
        );

        await waitFor(() => {
            expect(createRealtimeConnection).toHaveBeenCalled();
        });

        // Unmount while connection is in-flight
        unmount();

        // Connection resolves after unmount
        pending.resolve({ pc: {}, dc: {}, micStream: createMockMicStream(), close });

        await waitFor(() => {
            expect(close).toHaveBeenCalled();
        });
    });

    it('should auto-reconnect when the realtime connection closes unexpectedly', async () => {
        const { unmount } = await renderAndWaitReady();

        // Trigger unexpected close — this calls setConnectionState("idle") internally
        const opts = createRealtimeConnection.mock.calls[0][0];
        opts.onClose();

        // Icon disappears while re-connecting (idle → connecting → ...)
        await waitFor(() => {
            expect(screen.queryByTestId('icon-record_voice_off')).not.toBeInTheDocument();
        });

        // Icon reappears once reconnect completes (ready)
        await waitFor(() => {
            expect(screen.getByTestId('icon-record_voice_off')).toBeInTheDocument();
        });

        // A second bootstrap + connection was made
        expect(bootstrapHumanInputRealtimeSession).toHaveBeenCalledTimes(2);

        unmount();
    });

    // ── Misc ───────────────────────────────────────────────────────────────────

    it('should show panelist-specific placeholder when isPanelist is true', async () => {
        await renderAndWaitReady({ isPanelist: true, currentSpeakerName: 'Mr. Potato' });
        expect(screen.getByPlaceholderText('human.panelist')).toBeInTheDocument();
    });
});
