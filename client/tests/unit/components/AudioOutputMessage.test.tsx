import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import AudioOutputMessage from '../../../src/components/AudioOutputMessage';
import React from 'react';

// Specialized Mocks
const mockStart = vi.fn();
const mockStop = vi.fn();
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockAddEventListener = vi.fn();

const mockSourceNode = {
    buffer: null,
    start: mockStart,
    stop: mockStop,
    connect: mockConnect,
    disconnect: mockDisconnect,
    addEventListener: mockAddEventListener,
};

const mockCreateBufferSource = vi.fn(() => mockSourceNode);

const mockAudioContext = {
    createBufferSource: mockCreateBufferSource,
};

// Mock Gain Node
const mockGainNode = {};

describe('AudioOutputMessage', () => {
    let audioContextRef: React.MutableRefObject<any>;
    let gainNodeRef: React.MutableRefObject<any>;

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
