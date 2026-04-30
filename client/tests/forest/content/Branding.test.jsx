import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Landing from '@newMeeting/Landing';
import Forest from '@forest/Forest';

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

// Mock portrait / mobile so Landing shows the main content
vi.mock('react-responsive', () => ({
    useMediaQuery: () => false,
}));

describe('Forest Content & Branding', () => {

    it('Landing page shows Council branding', () => {
        render(
            <MemoryRouter>
                <Landing newMeetingPath="/en/new" />
            </MemoryRouter>
        );
        expect(screen.getByText('COUNCIL OF FOREST')).toBeInTheDocument();
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
