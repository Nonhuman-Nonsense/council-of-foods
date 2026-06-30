
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import HumanInput from '@council/humanInput/HumanInput';
import { useMobile } from '@/utils';
import { bootstrapHumanInputRealtimeSession } from '@api/realtimeSession';
import { createRealtimeConnection } from '@/realtime/realtimeConnection';
import { BUTTON_BANNER_IDLE_MS } from '@museum/button/useButtonBanner';

const mockClaim = vi.hoisted(() => vi.fn());
const mockRelease = vi.hoisted(() => vi.fn());
const mockSetLed = vi.hoisted(() => vi.fn());
const mockAgentMode = vi.hoisted(() => ({ value: "always-on" }));

const mockButtonState = vi.hoisted(() => ({
    pressed: false,
    buttonOwner: null,
}));

const mockButtonListeners = vi.hoisted(() => new Set());

function notifyMockButtonListeners() {
    mockButtonListeners.forEach((listener) => listener());
}

function setMockPressed(value) {
    mockButtonState.pressed = value;
    if (value) {
        mockButtonState.buttonOwner = 'human-input';
    }
    notifyMockButtonListeners();
}

// Mocks
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key) => key, i18n: { language: 'en' } }),
}));

vi.mock('@/utils', () => ({
    useMobile: vi.fn(),
    dvh: "vh",
    mapFoodIndex: (l, i) => i
}));

vi.mock('@/settings/councilSettings', () => ({
    useCouncilSettings: () => ({
        agentMode: mockAgentMode.value,
        isMuseumMode: false,
        mode: 'web',
        setAppMode: vi.fn(),
        setAgentMode: vi.fn(),
    }),
    getDevLogEnabled: () => false,
    isDevLogCategoryEnabled: () => false,
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

vi.mock('@council/ConversationControlIcon', () => ({
    default: ({ icon, onClick }) => (
        <button data-testid={`icon-${icon}`} onClick={onClick}>{icon}</button>
    )
}));

vi.mock('@/museum/button/buttonStore', () => ({
    useButtonStore: Object.assign(
        (selector) => selector(mockButtonState),
        {
            getState: () => ({
                setButtonBannerVisible: vi.fn(),
            }),
        },
    ),
}));

vi.mock('@/museum/button/useButton', async () => {
    const React = await import('react');
    return {
        useButton: (owner) => {
            const pressed = React.useSyncExternalStore(
                (onStoreChange) => {
                    mockButtonListeners.add(onStoreChange);
                    return () => mockButtonListeners.delete(onStoreChange);
                },
                () => mockButtonState.buttonOwner === owner && mockButtonState.pressed,
            );
            return {
                claim: mockClaim,
                release: mockRelease,
                setLed: mockSetLed,
                pressed,
                isOwner: mockButtonState.buttonOwner === owner,
            };
        },
    };
});

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
        expect(screen.queryByPlaceholderText('human.placeholder')).not.toBeInTheDocument();

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
        expect(screen.getByTestId('lottie-player')).toBeInTheDocument();
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

        const textarea = screen.getByPlaceholderText('human.placeholder');
        fireEvent.change(textarea, { target: { value: 'Hello World' } });
        expect(textarea.value).toBe('Hello World');

        const sendButton = screen.getByTestId('icon-send_message');
        expect(sendButton).toBeInTheDocument();

        fireEvent.click(sendButton);
        expect(mockOnSubmit).toHaveBeenCalledWith('Hello World');
    });

    it('should submit text without manual character targeting', async () => {
        await renderAndWaitReady({ onSubmitHumanMessage: mockOnSubmit });

        const textarea = screen.getByPlaceholderText('human.placeholder');
        fireEvent.change(textarea, { target: { value: 'Question for the council' } });
        fireEvent.click(screen.getByTestId('icon-send_message'));

        expect(mockOnSubmit).toHaveBeenCalledWith('Question for the council');
    });

    it('should submit on Enter but not on Shift+Enter', async () => {
        await renderAndWaitReady({ onSubmitHumanMessage: mockOnSubmit });

        const textarea = screen.getByPlaceholderText('human.placeholder');
        fireEvent.change(textarea, { target: { value: 'Line 1' } });

        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
        expect(mockOnSubmit).not.toHaveBeenCalled();

        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
        expect(mockOnSubmit).toHaveBeenCalledWith('Line 1');
    });

    it('should enforce max input length', async () => {
        await renderAndWaitReady();
        const textarea = screen.getByPlaceholderText('human.placeholder');
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

        fireEvent.focus(screen.getByPlaceholderText('human.placeholder'));

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
        expect(screen.getByTestId('lottie-player')).toBeInTheDocument();
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

// ── PTT museum mode ────────────────────────────────────────────────────────────

describe('HumanInput PTT museum mode', () => {
    let mockOnSubmit;

    beforeEach(() => {
        mockOnSubmit = vi.fn();
        mockAgentMode.value = "ptt";
        useMobile.mockReturnValue(false);
        mockClaim.mockClear();
        mockRelease.mockClear();
        mockSetLed.mockClear();
        mockButtonState.pressed = false;
        setMockPressed(false);
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
        mockAgentMode.value = "always-on";
        setMockPressed(false);
    });

    async function renderPttReady(extraProps = {}) {
        const result = render(
            <HumanInput
                phase="active"
                isButtonMuseumMode={true}
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
                {...extraProps}
            />
        );
        // In PTT mode, loading spinner shows only during "connecting".
        // Wait for it to disappear (ready state reached).
        await waitFor(() => {
            expect(screen.queryByTestId('lottie-player')).not.toBeInTheDocument();
        });
        return result;
    }

    // ── UI ────────────────────────────────────────────────────────────────────

    it('shows mic icon in PTT mode', async () => {
        await renderPttReady();
        expect(screen.getByAltText('Say something!')).toBeInTheDocument();
    });

    it('hides mic-off button in PTT mode (no clickable record trigger)', async () => {
        await renderPttReady();
        expect(screen.queryByTestId('icon-record_voice_off')).not.toBeInTheDocument();
    });

    it('shows record_voice_on indicator while recording in PTT mode', async () => {
        await renderPttReady();

        setMockPressed(true);

        await waitFor(() => {
            expect(screen.getByTestId('icon-record_voice_on')).toBeInTheDocument();
        });
    });

    it('hides send button in PTT mode', async () => {
        await renderPttReady();
        const textarea = screen.getByPlaceholderText('ptt.humanPlaceholder');
        fireEvent.change(textarea, { target: { value: 'Hello' } });
        expect(screen.queryByTestId('icon-send_message')).not.toBeInTheDocument();
    });

    it('shows PTT placeholder text', async () => {
        await renderPttReady();
        expect(screen.getByPlaceholderText('ptt.humanPlaceholder')).toBeInTheDocument();
    });

    it('shows loading spinner during connecting in PTT mode', async () => {
        const pending = { resolve: null };
        createRealtimeConnection.mockReturnValue(
            new Promise(r => { pending.resolve = r; })
        );

        render(
            <HumanInput
                phase="active"
                isButtonMuseumMode={true}
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
            />
        );

        expect(screen.getByTestId('lottie-player')).toBeInTheDocument();

        pending.resolve({ pc: {}, dc: {}, micStream: createMockMicStream(), close: vi.fn() });

        await waitFor(() => {
            expect(screen.queryByTestId('lottie-player')).not.toBeInTheDocument();
        });
    });

    // ── LED management ────────────────────────────────────────────────────────

    it('does not claim the button when agentMode is not ptt', async () => {
        mockAgentMode.value = "always-on";
        mockClaim.mockClear();
        await renderAndWaitReady({ onSubmitHumanMessage: mockOnSubmit });
        expect(mockClaim).not.toHaveBeenCalled();
    });

    it('claims human-input and sets pulse LED when active with agentMode ptt', async () => {
        await renderPttReady();
        expect(mockClaim).toHaveBeenCalled();
        expect(mockSetLed).toHaveBeenCalledWith('pulse');
    });

    // ── Press → record, release → finish + auto-submit ────────────────────────

    it('starts recording on PTT press', async () => {
        const track = { enabled: false };
        createRealtimeConnection.mockResolvedValue({
            pc: {}, dc: {}, micStream: createMockMicStream([track]), close: vi.fn(),
        });

        await renderPttReady();

        // Simulate press
        setMockPressed(true);

        await waitFor(() => {
            expect(track.enabled).toBe(true);
        });
    });

    it('auto-starts recording if button is held while connection becomes ready', async () => {
        // Simulate the user pressing the PTT button before the pre-warm finishes.
        // Simulate held PTT when connection becomes ready (LED pulse + keyboard held).
        // keyboardDown is set BEFORE we let the connection resolve.
        const pending = { resolve: null };
        const track = { enabled: false };
        createRealtimeConnection.mockReturnValue(
            new Promise(r => { pending.resolve = r; })
        );

        render(
            <HumanInput
                phase="active"
                isButtonMuseumMode={true}
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={mockOnSubmit}
                liveKey="test-key"
            />
        );

        // Still connecting — button is held down by the user
        expect(screen.getByTestId('lottie-player')).toBeInTheDocument();
        setMockPressed(true);

        // Now the connection resolves (connecting → ready)
        pending.resolve({ pc: {}, dc: {}, micStream: createMockMicStream([track]), close: vi.fn() });

        // Should jump straight to recording without requiring a re-press
        await waitFor(() => {
            expect(track.enabled).toBe(true);
        });

        // The recording indicator should appear
        await waitFor(() => {
            expect(screen.getByTestId('icon-record_voice_on')).toBeInTheDocument();
        });
    });

    it('auto-submits after PTT release once transcript settles', async () => {
        await renderPttReady();

        // Type some text (simulating transcript arriving via recording)
        const textarea = screen.getByPlaceholderText('ptt.humanPlaceholder');
        fireEvent.change(textarea, { target: { value: 'Hello dear council' } });

        setMockPressed(true);
        await waitFor(() => {
            expect(screen.getByTestId('icon-record_voice_on')).toBeInTheDocument();
        });

        setMockPressed(false);

        await waitFor(() => {
            expect(mockOnSubmit).toHaveBeenCalledWith('Hello dear council');
        });
    });

    it('does not auto-submit when transcript has fewer than three words', async () => {
        await renderPttReady();

        const textarea = screen.getByPlaceholderText('ptt.humanPlaceholder');
        fireEvent.change(textarea, { target: { value: 'Hello council' } });

        setMockPressed(true);
        await waitFor(() => {
            expect(screen.getByTestId('icon-record_voice_on')).toBeInTheDocument();
        });

        setMockPressed(false);

        await new Promise(r => setTimeout(r, 50));
        expect(mockOnSubmit).not.toHaveBeenCalled();
        expect(textarea).toHaveValue('Hello council');
    });

    it('waits for incremental transcript before auto-submitting', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        bootstrapHumanInputRealtimeSession.mockResolvedValue({
            provider: 'openai',
            iceServers: [],
            session: { type: 'transcription', audio: {} },
        });
        let onEvent;
        createRealtimeConnection.mockImplementation(async (opts) => {
            onEvent = opts.onEvent;
            return { pc: {}, dc: {}, micStream: createMockMicStream(), close: vi.fn() };
        });

        await renderPttReady();

        setMockPressed(true);
        await waitFor(() => {
            expect(screen.getByTestId('icon-record_voice_on')).toBeInTheDocument();
        });

        onEvent({ type: 'input_audio_buffer.speech_started' });
        onEvent({
            type: 'conversation.item.input_audio_transcription.delta',
            item_id: 'item_1',
            delta: 'Hello',
        });
        onEvent({
            type: 'conversation.item.input_audio_transcription.delta',
            item_id: 'item_1',
            delta: ' dear',
        });
        setMockPressed(false);

        await vi.advanceTimersByTimeAsync(2000);
        expect(mockOnSubmit).not.toHaveBeenCalled();

        onEvent({
            type: 'conversation.item.input_audio_transcription.delta',
            item_id: 'item_1',
            delta: ' council',
        });

        await vi.advanceTimersByTimeAsync(2000);

        await waitFor(() => {
            expect(mockOnSubmit).toHaveBeenCalledWith('Hello dear council');
        });

        vi.useRealTimers();
    });

    it('builds incremental Soniox transcript partials on Inworld sessions', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        bootstrapHumanInputRealtimeSession.mockResolvedValue({
            provider: 'inworld',
            iceServers: [],
            session: {
                type: 'realtime',
                audio: { input: { transcription: { model: 'test/soniox-stt' } } },
            },
        });
        let onEvent;
        createRealtimeConnection.mockImplementation(async (opts) => {
            onEvent = opts.onEvent;
            return { pc: {}, dc: {}, micStream: createMockMicStream(), close: vi.fn() };
        });

        await renderPttReady();

        setMockPressed(true);
        await waitFor(() => {
            expect(screen.getByTestId('icon-record_voice_on')).toBeInTheDocument();
        });

        const textarea = screen.getByPlaceholderText('ptt.humanPlaceholder');

        onEvent({ type: 'input_audio_buffer.speech_started' });
        onEvent({
            type: 'conversation.item.input_audio_transcription.delta',
            item_id: 'item_1',
            delta: 'Hej',
        });
        onEvent({
            type: 'conversation.item.input_audio_transcription.delta',
            item_id: 'item_1',
            delta: ' där',
        });

        await waitFor(() => {
            expect(textarea).toHaveValue('Hej där');
        });

        vi.useRealTimers();
    });

    it('handles mixed Soniox suffix and cumulative partials without stacking', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        bootstrapHumanInputRealtimeSession.mockResolvedValue({
            provider: 'inworld',
            iceServers: [],
            session: {
                type: 'realtime',
                audio: { input: { transcription: { model: 'test/soniox-stt' } } },
            },
        });
        let onEvent;
        createRealtimeConnection.mockImplementation(async (opts) => {
            onEvent = opts.onEvent;
            return { pc: {}, dc: {}, micStream: createMockMicStream(), close: vi.fn() };
        });

        await renderPttReady();

        setMockPressed(true);
        await waitFor(() => {
            expect(screen.getByTestId('icon-record_voice_on')).toBeInTheDocument();
        });

        const textarea = screen.getByPlaceholderText('ptt.humanPlaceholder');

        onEvent({ type: 'input_audio_buffer.speech_started' });
        onEvent({
            type: 'conversation.item.input_audio_transcription.delta',
            item_id: 'item_1',
            delta: 'Och',
        });
        onEvent({
            type: 'conversation.item.input_audio_transcription.delta',
            item_id: 'item_1',
            delta: ' nu',
        });
        onEvent({
            type: 'conversation.item.input_audio_transcription.delta',
            item_id: 'item_1',
            delta: ' ska vi se en tredje gång.',
        });
        onEvent({
            type: 'conversation.item.input_audio_transcription.delta',
            item_id: 'item_1',
            delta: 'Och nu ska vi se en tredje gång, ska',
        });
        onEvent({
            type: 'conversation.item.input_audio_transcription.delta',
            item_id: 'item_1',
            delta: ' vi',
        });

        await waitFor(() => {
            expect(textarea).toHaveValue('Och nu ska vi se en tredje gång, ska vi');
        });

        vi.useRealTimers();
    });

    it('builds cumulative transcript partials without stacking duplicated prefixes', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        bootstrapHumanInputRealtimeSession.mockResolvedValue({
            provider: 'inworld',
            iceServers: [],
            session: {
                type: 'realtime',
                audio: { input: { transcription: { model: 'test/assemblyai-stt' } } },
            },
        });
        let onEvent;
        createRealtimeConnection.mockImplementation(async (opts) => {
            onEvent = opts.onEvent;
            return { pc: {}, dc: {}, micStream: createMockMicStream(), close: vi.fn() };
        });

        await renderPttReady();

        setMockPressed(true);
        await waitFor(() => {
            expect(screen.getByTestId('icon-record_voice_on')).toBeInTheDocument();
        });

        const textarea = screen.getByPlaceholderText('ptt.humanPlaceholder');

        onEvent({ type: 'input_audio_buffer.speech_started' });
        onEvent({
            type: 'conversation.item.input_audio_transcription.delta',
            item_id: 'item_1',
            delta: 'I am say',
        });
        onEvent({
            type: 'conversation.item.input_audio_transcription.delta',
            item_id: 'item_1',
            delta: 'I am saying something',
        });
        onEvent({
            type: 'conversation.item.input_audio_transcription.delta',
            item_id: 'item_1',
            delta: 'I am saying something longer',
        });

        await waitFor(() => {
            expect(textarea).toHaveValue('I am saying something longer');
        });

        setMockPressed(false);
        onEvent({ type: 'input_audio_buffer.speech_stopped' });
        await vi.advanceTimersByTimeAsync(2000);

        await waitFor(() => {
            expect(mockOnSubmit).toHaveBeenCalledWith('I am saying something longer');
        });

        vi.useRealTimers();
    });

    it('ignores late deltas after completed for the same segment', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        let onEvent;
        createRealtimeConnection.mockImplementation(async (opts) => {
            onEvent = opts.onEvent;
            return { pc: {}, dc: {}, micStream: createMockMicStream(), close: vi.fn() };
        });

        await renderPttReady();

        setMockPressed(true);
        await waitFor(() => {
            expect(screen.getByTestId('icon-record_voice_on')).toBeInTheDocument();
        });

        const textarea = screen.getByPlaceholderText('ptt.humanPlaceholder');

        onEvent({ type: 'input_audio_buffer.speech_started' });
        onEvent({
            type: 'conversation.item.input_audio_transcription.completed',
            item_id: 'item_1',
            transcript: '',
        });
        onEvent({
            type: 'conversation.item.input_audio_transcription.delta',
            item_id: 'item_1',
            delta: 'one two three',
        });
        onEvent({
            type: 'conversation.item.input_audio_transcription.completed',
            item_id: 'item_1',
            transcript: 'one two three',
        });
        onEvent({
            type: 'conversation.item.input_audio_transcription.delta',
            item_id: 'item_1',
            delta: 'one two three corrupted',
        });

        await waitFor(() => {
            expect(textarea).toHaveValue('one two three');
        });

        setMockPressed(false);
        onEvent({ type: 'input_audio_buffer.speech_stopped' });
        await vi.advanceTimersByTimeAsync(2000);

        await waitFor(() => {
            expect(mockOnSubmit).toHaveBeenCalledWith('one two three');
        });

        vi.useRealTimers();
    });

    it('auto-submits when transcript arrives after release while already ready', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        let onEvent;
        createRealtimeConnection.mockImplementation(async (opts) => {
            onEvent = opts.onEvent;
            return { pc: {}, dc: {}, micStream: createMockMicStream(), close: vi.fn() };
        });

        await renderPttReady();

        setMockPressed(true);
        await waitFor(() => {
            expect(screen.getByTestId('icon-record_voice_on')).toBeInTheDocument();
        });

        onEvent({ type: 'input_audio_buffer.speech_started' });
        setMockPressed(false);

        await waitFor(() => {
            expect(screen.queryByTestId('icon-record_voice_on')).not.toBeInTheDocument();
        });

        onEvent({
            type: 'conversation.item.input_audio_transcription.completed',
            item_id: 'item_1',
            transcript: 'one two three',
        });

        await vi.advanceTimersByTimeAsync(2000);

        await waitFor(() => {
            expect(mockOnSubmit).toHaveBeenCalledWith('one two three');
        });

        vi.useRealTimers();
    });

    it('does not auto-submit when textarea is empty after PTT release', async () => {
        await renderPttReady();

        setMockPressed(true);
        await waitFor(() => {
            expect(screen.getByTestId('icon-record_voice_on')).toBeInTheDocument();
        });

        setMockPressed(false);

        // Wait briefly to confirm no submit happened
        await new Promise(r => setTimeout(r, 50));
        expect(mockOnSubmit).not.toHaveBeenCalled();
    });

    // ── Non-PTT mode unchanged ────────────────────────────────────────────────

    it('non-PTT mode: shows mic icon (always visible)', async () => {
        await renderAndWaitReady({ onSubmitHumanMessage: mockOnSubmit });
        expect(screen.getByAltText('Say something!')).toBeInTheDocument();
    });

    it('non-PTT mode: shows mic button', async () => {
        await renderAndWaitReady({ onSubmitHumanMessage: mockOnSubmit });
        expect(screen.getByTestId('icon-record_voice_off')).toBeInTheDocument();
    });
});

// ── PTT abandonment (useButtonBanner) ────────────────────────────────────────

describe('HumanInput PTT abandonment', () => {
    let mockOnAbandon;

    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        mockOnAbandon = vi.fn();
        mockAgentMode.value = "ptt";
        useMobile.mockReturnValue(false);
        mockClaim.mockClear();
        mockRelease.mockClear();
        mockSetLed.mockClear();
        mockButtonState.pressed = false;
        setMockPressed(false);
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
        vi.useRealTimers();
        vi.clearAllMocks();
        mockAgentMode.value = "always-on";
        setMockPressed(false);
    });

    async function flushConnectionReady() {
        await act(async () => {
            await Promise.resolve();
        });
    }

    async function renderAbandonReady(extraProps = {}) {
        render(
            <HumanInput
                phase="active"
                isButtonMuseumMode={true}
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={vi.fn()}
                onAbandonHumanTurn={mockOnAbandon}
                liveKey="test-key"
                {...extraProps}
            />
        );
        await flushConnectionReady();
    }

    it('fires onAbandonHumanTurn after 20s idle in PTT active phase', async () => {
        await renderAbandonReady();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(BUTTON_BANNER_IDLE_MS);
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(BUTTON_BANNER_IDLE_MS);
        });

        expect(mockOnAbandon).toHaveBeenCalledTimes(1);
    });

    it('does not fire while button is held', async () => {
        await renderAbandonReady();

        act(() => {
            setMockPressed(true);
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(BUTTON_BANNER_IDLE_MS * 2);
        });

        expect(mockOnAbandon).not.toHaveBeenCalled();
    });

    it('restarts timer on button release', async () => {
        await renderAbandonReady();

        act(() => {
            setMockPressed(true);
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1_000);
        });
        act(() => {
            setMockPressed(false);
        });
        // Wait for finishing → ready, then full idle + terminal windows from release.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(3_000);
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(BUTTON_BANNER_IDLE_MS - 1);
        });

        expect(mockOnAbandon).not.toHaveBeenCalled();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1 + BUTTON_BANNER_IDLE_MS);
        });

        expect(mockOnAbandon).toHaveBeenCalledTimes(1);
    });

    it('does not run in warm phase', async () => {
        render(
            <HumanInput
                phase="warm"
                isButtonMuseumMode={true}
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={vi.fn()}
                onAbandonHumanTurn={mockOnAbandon}
                liveKey="test-key"
            />
        );
        await flushConnectionReady();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(BUTTON_BANNER_IDLE_MS * 2);
        });

        expect(mockOnAbandon).not.toHaveBeenCalled();
    });

    it('fires in web PTT mode without isButtonMuseumMode', async () => {
        await renderAbandonReady({ isButtonMuseumMode: false });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(BUTTON_BANNER_IDLE_MS);
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(BUTTON_BANNER_IDLE_MS);
        });

        expect(mockOnAbandon).toHaveBeenCalledTimes(1);
    });

    it('does not run when agent mode is not ptt', async () => {
        mockAgentMode.value = "always-on";
        vi.useRealTimers();

        render(
            <HumanInput
                phase="active"
                isButtonMuseumMode={false}
                isPanelist={false}
                currentSpeakerName=""
                onSubmitHumanMessage={vi.fn()}
                onAbandonHumanTurn={mockOnAbandon}
                liveKey="test-key"
            />
        );

        await waitFor(() => {
            expect(screen.getByTestId('icon-record_voice_off')).toBeInTheDocument();
        });

        await new Promise((r) => setTimeout(r, 100));

        expect(mockOnAbandon).not.toHaveBeenCalled();
    });
});
