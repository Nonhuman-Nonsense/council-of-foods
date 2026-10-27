import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import AudioOutputMessage, { resumeOffsetFor } from '@council/output/AudioOutputMessage';
import React from 'react';

// Specialized Mocks
const mockStart = vi.fn();
const mockStop = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();

const mockSourceNode = {
    buffer: null,
    start: mockStart,
    stop: mockStop,
    connect: mockConnect,
    disconnect: mockDisconnect,
    addEventListener: mockAddEventListener,
    removeEventListener: mockRemoveEventListener,
};

const mockCreateBufferSource = vi.fn(() => mockSourceNode);

const mockAudioContext = {
    createBufferSource: mockCreateBufferSource,
    currentTime: 12.5,
};

// Mock Gain Node
const mockGainNode = {};

describe('AudioOutputMessage', () => {
    let audioContextRef: React.RefObject<any>;
    let gainNodeRef: React.RefObject<any>;

    beforeEach(() => {
        vi.clearAllMocks();
        audioContextRef = { current: mockAudioContext };
        gainNodeRef = { current: mockGainNode };
        mockSourceNode.buffer = null; // Reset buffer
    });

    const mockAudioBuffer = { length: 100 } as any; // Mock AudioBuffer

    it('plays audio when a valid message is received', () => {
        const message = { id: 'msg1', audio: mockAudioBuffer };

        render(
            <AudioOutputMessage
                currentAudioMessage={message}
                audioContext={audioContextRef}
                gainNode={gainNodeRef}
                onFinishedPlaying={vi.fn()}
            />
        );

        expect(mockCreateBufferSource).toHaveBeenCalled();
        expect(mockSourceNode.buffer).toBe(mockAudioBuffer);
        expect(mockConnect).toHaveBeenCalledWith(mockGainNode);
        expect(mockStart).toHaveBeenCalled();
        expect(mockAddEventListener).toHaveBeenCalledWith('ended', expect.any(Function), true);
    });

    it('reports the AudioContext time when playback starts', () => {
        const onPlaybackStarted = vi.fn();
        const message = { id: 'msg-clock', audio: mockAudioBuffer };

        render(
            <AudioOutputMessage
                currentAudioMessage={message}
                audioContext={audioContextRef}
                gainNode={gainNodeRef}
                onFinishedPlaying={vi.fn()}
                onPlaybackStarted={onPlaybackStarted}
            />
        );

        expect(onPlaybackStarted).toHaveBeenCalledWith({
            messageId: 'msg-clock',
            startedAtAudioContextTime: 12.5
        });
    });

    it('does not play if audio is missing or empty', () => {
        render(
            <AudioOutputMessage
                currentAudioMessage={{ id: 'msg2', audio: undefined }}
                audioContext={audioContextRef}
                gainNode={gainNodeRef}
                onFinishedPlaying={vi.fn()}
            />
        );
        expect(mockCreateBufferSource).not.toHaveBeenCalled();

        render(
            <AudioOutputMessage
                currentAudioMessage={{ id: 'msg3', audio: { length: 0 } as any }}
                audioContext={audioContextRef}
                gainNode={gainNodeRef}
                onFinishedPlaying={vi.fn()}
            />
        );
        expect(mockCreateBufferSource).not.toHaveBeenCalled();
    });

    it('stops and disconnects audio on unmount', () => {
        const message = { id: 'msg1', audio: mockAudioBuffer };

        const { unmount } = render(
            <AudioOutputMessage
                currentAudioMessage={message}
                audioContext={audioContextRef}
                gainNode={gainNodeRef}
                onFinishedPlaying={vi.fn()}
            />
        );

        unmount();

        expect(mockStop).toHaveBeenCalled();
        expect(mockDisconnect).toHaveBeenCalled();
    });

    it('triggers onFinishedPlaying when audio ends', () => {
        const onFinishedPlaying = vi.fn();
        const message = { id: 'msg1', audio: mockAudioBuffer };

        render(
            <AudioOutputMessage
                currentAudioMessage={message}
                audioContext={audioContextRef}
                gainNode={gainNodeRef}
                onFinishedPlaying={onFinishedPlaying}
            />
        );

        // Simulate 'ended' event
        // The second argument to addEventListener is the callback
        const callback = mockAddEventListener.mock.calls[0][1];
        callback();

        expect(onFinishedPlaying).toHaveBeenCalled();
    });
});

describe('AudioOutputMessage hold and resume', () => {
    const sentences = [
        { text: 'One.', start: 0, end: 2 },
        { text: 'Two.', start: 2, end: 5 },
        { text: 'Three.', start: 5, end: 8 },
    ];
    const audio = { length: 100 } as any;

    function setup() {
        const context = { currentTime: 100, createBufferSource: vi.fn() };
        const sources: any[] = [];
        context.createBufferSource.mockImplementation(() => {
            const source = {
                buffer: null,
                start: vi.fn(),
                stop: vi.fn(),
                connect: vi.fn(),
                disconnect: vi.fn(),
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
            };
            sources.push(source);
            return source;
        });
        const callbacks = { onFinishedPlaying: vi.fn(), onPlaybackStarted: vi.fn() };
        const view = (message: any, held: boolean) => (
            <AudioOutputMessage
                currentAudioMessage={message}
                audioContext={{ current: context } as any}
                gainNode={{ current: {} } as any}
                held={held}
                {...callbacks}
            />
        );
        return { context, sources, callbacks, view };
    }

    it('resumes from the start of the interrupted sentence, with the subtitle clock backdated to match', () => {
        const { context, sources, callbacks, view } = setup();
        const message = { id: 'm1', audio, sentences };
        const { rerender } = render(view(message, false));

        context.currentTime = 103.5; // 3.5s in: inside "Two."
        rerender(view(message, true));
        expect(sources[0].stop).toHaveBeenCalled();

        context.currentTime = 160;
        rerender(view(message, false));

        expect(sources).toHaveLength(2);
        expect(sources[1].start).toHaveBeenCalledWith(0, 2);
        expect(callbacks.onPlaybackStarted).toHaveBeenLastCalledWith({
            messageId: 'm1',
            startedAtAudioContextTime: 158,
        });
    });

    it('does not report the message finished when the hold stops it', () => {
        const { sources, callbacks, view } = setup();
        const message = { id: 'm1', audio, sentences };
        const { rerender } = render(view(message, false));
        const ended = sources[0].addEventListener.mock.calls[0][1];

        rerender(view(message, true));
        ended();

        expect(callbacks.onFinishedPlaying).not.toHaveBeenCalled();
    });

    it('holds a message that arrives during the hold, then plays it from the beginning', () => {
        const { sources, view } = setup();
        const message = { id: 'm1', audio, sentences };
        const { rerender } = render(view(message, true));
        expect(sources).toHaveLength(0);

        rerender(view(message, false));
        expect(sources[0].start).toHaveBeenCalledWith(0, 0);
    });

    it('plays the next message from the beginning after an interrupted one', () => {
        const { context, sources, view } = setup();
        const first = { id: 'm1', audio, sentences };
        const { rerender } = render(view(first, false));
        context.currentTime = 106;
        rerender(view(first, true));
        rerender(view({ id: 'm2', audio, sentences }, true));

        rerender(view({ id: 'm2', audio, sentences }, false));
        expect(sources[1].start).toHaveBeenCalledWith(0, 0);
    });
});

describe('resumeOffsetFor', () => {
    const sentences = [
        { text: 'One.', start: 0.4, end: 2 },
        { text: 'Two.', start: 2, end: 5 },
    ];

    it.each([
        { name: 'mid-sentence goes back to that sentence', sentences, elapsed: 3.2, expected: 2 },
        { name: 'exactly on a sentence start stays there', sentences, elapsed: 2, expected: 2 },
        { name: 'before the first sentence starts from the top', sentences, elapsed: 0.1, expected: 0 },
        { name: 'without sentence timings resumes where it stopped', sentences: [], elapsed: 3.2, expected: 3.2 },
    ])('$name', ({ sentences, elapsed, expected }) => {
        expect(resumeOffsetFor(sentences, elapsed)).toBe(expected);
    });
});
