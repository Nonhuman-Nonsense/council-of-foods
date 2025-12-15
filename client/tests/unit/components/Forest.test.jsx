import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import Forest from '../../../src/components/Forest';

// Mock child components to avoid deep rendering issues and fetch calls
vi.mock('../../../src/components/FoodAnimation', () => ({ default: () => <div data-testid="food-animation" /> }));
// Mock internal BeingAudio if it's not exported? No, it's internal. 
// We can mock global fetch instead.
global.fetch = vi.fn(() => Promise.resolve({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
}));

// Mock utils
vi.mock('../../../src/utils', () => ({
    dvh: 'vh',
    minWindowHeight: 600,
    filename: (id) => id,
    useMobile: () => false, // Desktop by default
    useDocumentVisibility: () => true
}));

describe('Forest Component', () => {
    // Mock audio context
    const mockAudioContext = {
        current: {
            createGain: vi.fn(() => ({
                gain: {
                    setValueAtTime: vi.fn(),
                    linearRampToValueAtTime: vi.fn()
                },
                connect: vi.fn()
            })),
            createBufferSource: vi.fn(() => ({
                buffer: null,
                loop: false,
                connect: vi.fn(),
                start: vi.fn(),
                stop: vi.fn()
            })),
            destination: {},
            currentTime: 0,
            decodeAudioData: vi.fn().mockResolvedValue({})
        }
    };

    it('renders without crashing', () => {
        render(<Forest currentSpeakerId={null} isPaused={false} audioContext={mockAudioContext} />);
        // Check for static background or some element
        expect(screen.getByRole('img', { hidden: true })).toBeInTheDocument();
    });

    it('applies zoom transform when a speaker is active', async () => {
        const { container, rerender } = render(
            <Forest currentSpeakerId={null} isPaused={false} audioContext={mockAudioContext} />
        );

        // Get the main container div (the first div)
        const forestContainer = container.firstChild;

        // Initially no zoom. Transform might be scale(1) translate(0,0) or similar.
        // We know from the code: scale(${zoomInValue}) translate(${translate[0]}, ${translate[1]})
        // Default: scale(1) translate(0, 0)
        expect(forestContainer).toHaveStyle('transform: scale(1) translate(0, 0)');

        // Now set speaker to "salmon"
        rerender(
            <Forest currentSpeakerId="salmon" isPaused={false} audioContext={mockAudioContext} />
        );

        // Should have changed.
        await import('@testing-library/react').then(({ waitFor }) => waitFor(() => {
            const forestContainer = container.firstChild;
            expect(forestContainer).not.toHaveStyle('transform: scale(1) translate(0, 0)');
        }));

        const style = window.getComputedStyle(forestContainer);
        // We expect scale to be > 1 typically, or at least different.
        // Salmon zoom logic: zoom=(60/9)=6.66
        expect(style.transform).toContain('scale');
    });

    it('resets zoom when speaker is null', () => {
        const { container, rerender } = render(
            <Forest currentSpeakerId="salmon" isPaused={false} audioContext={mockAudioContext} />
        );
        const forestContainer = container.firstChild;
        expect(forestContainer).not.toHaveStyle('transform: scale(1) translate(0, 0)');

        rerender(
            <Forest currentSpeakerId={null} isPaused={false} audioContext={mockAudioContext} />
        );
        expect(forestContainer).toHaveStyle('transform: scale(1) translate(0, 0)');
    });
});
