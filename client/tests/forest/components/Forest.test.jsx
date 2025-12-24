import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Forest from '@/components/Forest';

// Mock child components
vi.mock('@/components/FoodAnimation', () => ({ default: () => <div data-testid="food-animation" /> }));

// Mock utils
vi.mock('@/utils', () => ({
    dvh: 'px',
    minWindowHeight: 600,
    filename: (id) => id,
    useMobile: () => false,
    useDocumentVisibility: () => true
}));

// Mock global fetch
global.fetch = vi.fn(() => Promise.resolve({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
}));

describe('Forest Visual Logic', () => {
    const mockAudioContext = {
        current: {
            createGain: vi.fn(() => ({
                gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
                connect: vi.fn()
            })),
            createBufferSource: vi.fn(() => ({
                buffer: null, loop: false, connect: vi.fn(), start: vi.fn(), stop: vi.fn()
            })),
            destination: {},
            currentTime: 0,
            decodeAudioData: vi.fn().mockResolvedValue({})
        }
    };

    it('renders Forest background', () => {
        const { container } = render(<Forest currentSpeakerId={null} isPaused={false} audioContext={mockAudioContext} />);
        const html = container.innerHTML;
        // Forest background + characters
        expect(html).toContain('forest');
    });

    it('zooms in when valid speaker is active', async () => {
        const { container, rerender } = render(
            <Forest currentSpeakerId={null} isPaused={false} audioContext={mockAudioContext} />
        );
        const forestContainer = container.firstChild;
        expect(forestContainer).toHaveStyle('transform: scale(1) translate(0, 0)');

        rerender(
            <Forest currentSpeakerId="salmon" isPaused={false} audioContext={mockAudioContext} />
        );

        // Wait for effect
        await import('@testing-library/react').then(({ waitFor }) => waitFor(() => {
            const forestContainer = container.firstChild;
            // JSDOM may reject complex calculated 'transform' values (like translate(min(...))), falling back to default.
            // However, transform-origin is successfully updated, proving the zoom logic ran and targeted the character.
            // Default is "0 0" (from state init).
            expect(forestContainer.style.transformOrigin).not.toContain('0 0');
            expect(forestContainer.style.transformOrigin).toContain('calc');
        }));
    });

    it('does not zoom for unknown speaker', async () => {
        const { container, rerender } = render(
            <Forest currentSpeakerId={null} isPaused={false} audioContext={mockAudioContext} />
        );
        rerender(
            <Forest currentSpeakerId="unknown_blob" isPaused={false} audioContext={mockAudioContext} />
        );
        // Should stay at default
        const forestContainer = container.firstChild;
        expect(forestContainer.style.transform).toBe('scale(1) translate(0, 0)');
    });
});
