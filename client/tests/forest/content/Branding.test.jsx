import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
// We need to test Landing.jsx for branding
import Landing from '@/components/settings/Landing';
// We verify characters from a source of truth (e.g. Forest.jsx characters array)
import Forest from '@/components/Forest';

// Mock router
import { MemoryRouter } from 'react-router';

// Mock utils
vi.mock('@/utils', () => ({
    dvh: 'px',
    minWindowHeight: 600,
    filename: (id) => id,
    useMobile: () => false,
    useDocumentVisibility: () => true
}));

// Mock global fetch for Forest audio loading
global.fetch = vi.fn(() => Promise.resolve({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
}));

describe('Forest Content & Branding', () => {

    it('Landing page shows Council branding', () => {
        render(
            <MemoryRouter>
                <Landing onContinueForward={() => { }} />
            </MemoryRouter>
        );
        // "COUNCIL" is hardcoded in Landing.jsx
        expect(screen.getByText('COUNCIL')).toBeInTheDocument();
    });

    it('Forest component has correct character set', () => {
        // Mock audio context properly to avoid crash
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

        const { container } = render(<Forest currentSpeakerId={null} isPaused={false} audioContext={mockAudioContext} />);

        // Characters might be images or videos depending on the type/browser support mocked.
        // Easiest is to check that their source files are present in the DOM.
        const html = container.innerHTML;

        expect(html).toContain('salmon');
        expect(html).toContain('pine');
        expect(html).toContain('lichen');

        // NEGATIVE TEST: Ensure NO Foods characters
        expect(html).not.toContain('tomato');
        expect(html).not.toContain('potato');
    });
});
