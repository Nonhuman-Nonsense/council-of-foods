import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import AudioOutput from '../../../src/components/AudioOutput';
import React from 'react';

// Specialized Mocks for Web Audio API
const mockSetValueAtTime = vi.fn();

const mockGainNode = {
    gain: {
        setValueAtTime: mockSetValueAtTime,
    },
    connect: vi.fn(),
};

const mockCreateGain = vi.fn(() => mockGainNode);

const mockAudioContext = {
    createGain: mockCreateGain,
    destination: {},
    currentTime: 1234.5,
};

describe('AudioOutput', () => {
    let audioContextRef: React.MutableRefObject<any>;

    beforeEach(() => {
        vi.clearAllMocks();
        audioContextRef = { current: mockAudioContext };
    });

    it('initializes output gain node on mount', () => {
        render(
            <AudioOutput
                audioContext={audioContextRef}
                currentAudioMessage={null}
                onFinishedPlaying={vi.fn()}
                isMuted={false}
            />
        );

        expect(mockCreateGain).toHaveBeenCalled();
        expect(mockGainNode.connect).toHaveBeenCalledWith(mockAudioContext.destination);
    });

    it('sets gain to 0 when muted', () => {
        render(
            <AudioOutput
                audioContext={audioContextRef}
                currentAudioMessage={null}
                onFinishedPlaying={vi.fn()}
                isMuted={true}
            />
        );

        // Should call setValueAtTime(0, currentTime)
        expect(mockSetValueAtTime).toHaveBeenCalledWith(0, mockAudioContext.currentTime);
    });

    it('sets gain to 1 when unmuted', () => {
        render(
            <AudioOutput
                audioContext={audioContextRef}
                currentAudioMessage={null}
                onFinishedPlaying={vi.fn()}
                isMuted={false}
            />
        );

        // Should call setValueAtTime(1, currentTime)
        expect(mockSetValueAtTime).toHaveBeenCalledWith(1, mockAudioContext.currentTime);
    });

    it('updates gain when mute state changes', () => {
        const { rerender } = render(
            <AudioOutput
                audioContext={audioContextRef}
                currentAudioMessage={null}
                onFinishedPlaying={vi.fn()}
                isMuted={false}
            />
        );

        // Initially unmuted
        expect(mockSetValueAtTime).toHaveBeenCalledWith(1, mockAudioContext.currentTime);
        mockSetValueAtTime.mockClear();

        // Re-render muted
        rerender(
            <AudioOutput
                audioContext={audioContextRef}
                currentAudioMessage={null}
                onFinishedPlaying={vi.fn()}
                isMuted={true}
            />
        );

        expect(mockSetValueAtTime).toHaveBeenCalledWith(0, mockAudioContext.currentTime);
    });
});
