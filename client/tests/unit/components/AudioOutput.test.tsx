import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import AudioOutput from '@council/output/AudioOutput';
import React from 'react';
import { audioBusesFor } from '@/audio/audioRouting';

// Specialized Mocks for Web Audio API
const mockSetValueAtTime = vi.fn();

const mockCreateGain = vi.fn(() => ({
    gain: {
        setValueAtTime: mockSetValueAtTime,
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
}));

const mockAudioContext = {
    createGain: mockCreateGain,
    destination: {},
    currentTime: 1234.5,
};

describe('AudioOutput', () => {
    let audioContextRef: React.RefObject<any>;

    beforeEach(() => {
        vi.clearAllMocks();
        audioContextRef = { current: mockAudioContext };
    });

    it('plays the voices onto the voices bus, so a split output keeps them off the scene side', () => {
        render(
            <AudioOutput
                audioContext={audioContextRef}
                currentAudioMessage={null}
                onFinishedPlaying={vi.fn()}
                isMuted={false}
            />
        );

        const buses = audioBusesFor(mockAudioContext as unknown as AudioContext);
        const outputGain = mockCreateGain.mock.results
            .map((result) => result.value)
            .find((node) => node !== buses.voices && node !== buses.scene);
        expect(outputGain?.connect).toHaveBeenCalledWith(buses.voices);
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
