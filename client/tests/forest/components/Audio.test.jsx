import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import Forest from '@/components/Forest';

// Mock utils to avoid layout issues
vi.mock('@/utils', () => ({
    dvh: 'px',
    minWindowHeight: 600,
    filename: (id) => id,
    useMobile: () => false,
    useDocumentVisibility: () => true
}));

// Mock fetch for audio files
global.fetch = vi.fn(() =>
    Promise.resolve({
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    })
);

describe('Forest Audio Logic', () => {
    let mockAudioContext;
    let mockGainNode;
    let mockBufferSource;

    beforeEach(() => {
        vi.clearAllMocks();

        // Fix: Mock HTMLMediaElement methods (play/pause) to support FoodAnimation
        window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
        window.HTMLMediaElement.prototype.pause = vi.fn();

        // Setup AudioContext Mocks
        mockGainNode = {
            connect: vi.fn(),
            gain: {
                setValueAtTime: vi.fn(),
                linearRampToValueAtTime: vi.fn(),
                value: 0
            }
        };

        mockBufferSource = {
            buffer: null,
            loop: false,
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn()
        };

        mockAudioContext = {
            createGain: vi.fn(() => mockGainNode),
            createBufferSource: vi.fn(() => mockBufferSource),
            decodeAudioData: vi.fn(() => Promise.resolve({})),
            currentTime: 0,
            destination: {},
            state: 'running',
            resume: vi.fn(),
            suspend: vi.fn()
        };

        // Wrap in a ref-like object because usage in Forest is audioContext.current
        // BUT wait, is passed as a prop "audioContext" which is a REF in Main.jsx?
        // Let's check Forest.jsx.
        // function Forest({ ..., audioContext }) ...
        // Inside: audioContext.current.createGain()
        // So yes, we pass a ref object { current: mockCtx }
    });

    it('AmbientAudio initializes and loads ambience on mount', async () => {
        const audioContextRef = { current: mockAudioContext };

        render(<Forest currentSpeakerId={null} isPaused={false} audioContext={audioContextRef} />);

        // AmbientAudio is rendered unconditionally
        await waitFor(() => {
            expect(mockAudioContext.createGain).toHaveBeenCalled();
            expect(mockAudioContext.createBufferSource).toHaveBeenCalled();
        });

        // Verify connection to destination
        expect(mockGainNode.connect).toHaveBeenCalledWith(mockAudioContext.destination);

        // Verify fetch of ambience
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('ambience.mp3'));

        // Verify start
        await waitFor(() => {
            expect(mockBufferSource.start).toHaveBeenCalled();
        });
    });

    it('BeingAudio loads and plays for active speaker', async () => {
        const audioContextRef = { current: mockAudioContext };
        const speakerId = 'river';

        // Initial render with valid speaker
        const { rerender } = render(<Forest currentSpeakerId={speakerId} isPaused={false} audioContext={audioContextRef} />);

        // Wait for connection
        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining(`${speakerId}.mp3`));
        });

        // Check gain ramp up
        // BeingAudio: useEffect [currentSpeakerId] -> setPlay(true) -> useEffect [play] -> linearRampToValueAtTime(volume)
        await waitFor(() => {
            expect(mockGainNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
                expect.any(Number), // volume
                expect.any(Number)  // time
            );
        });
    });

    it('BeingAudio ramps down (fades out) when speaker changes', async () => {
        const audioContextRef = { current: mockAudioContext };
        const speakerId = 'river';

        const { rerender } = render(<Forest currentSpeakerId={speakerId} isPaused={false} audioContext={audioContextRef} />);

        // Wait for start
        await waitFor(() => {
            expect(mockBufferSource.start).toHaveBeenCalled();
        });

        // Clear previous calls to focus on fade out
        mockGainNode.gain.linearRampToValueAtTime.mockClear();

        // Change speaker to null (or someone else)
        rerender(<Forest currentSpeakerId={null} isPaused={false} audioContext={audioContextRef} />);

        await waitFor(() => {
            // Should ramp to 0
            expect(mockGainNode.gain.linearRampToValueAtTime).toHaveBeenCalledWith(
                0,
                expect.any(Number)
            );
        });
    });
});
