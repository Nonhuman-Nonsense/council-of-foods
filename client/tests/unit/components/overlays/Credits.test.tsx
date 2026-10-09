import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import Credits, { CREDITS_HOLD_MS, CREDITS_SCROLL_MS, creditsRollPosition } from '@council/overlays/Credits';
import { capabilitiesFor } from '@/settings/capabilities';

/**
 * The credits an installation printing its letters ends every meeting on. Leaving them by the
 * button and returning to the landing page afterwards is the summary's (useSummaryExit, covered
 * in Summary.test.tsx); here: the roll's clock, and a click anywhere.
 */

const mockNotifyAutoplay = vi.fn();
vi.mock('@/autoplay/autoplayStore', () => ({
    notifyAutoplay: (...args: unknown[]) => mockNotifyAutoplay(...args),
    useAutoplayStore: (selector: (state: { phase: string; summaryProtocolFinished: boolean }) => unknown) =>
        selector({ phase: 'off', summaryProtocolFinished: false }),
    SUMMARY_RETURN_TO_ROOT_MS: 20_000,
}));

vi.mock('@/settings/councilSettings', () => ({
    useCouncilSettings: () => ({ capabilities: capabilitiesFor('museum') }),
}));

vi.mock('@museum/button/useButton', () => ({
    useButton: () => ({ claim: vi.fn(), release: vi.fn(), setArmed: vi.fn(), pressed: false, wantsMic: false, isOwner: true }),
}));
vi.mock('@museum/button/useButtonBanner', () => ({ useButtonBanner: vi.fn() }));

const mockNavigate = vi.fn();
vi.mock('react-router', () => ({ useNavigate: () => mockNavigate }));
vi.mock('@/navigation', () => ({ useRouting: () => ({ rootPath: '/en/' }) }));

describe('Credits', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mockNotifyAutoplay.mockClear();
        mockNavigate.mockClear();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('holds on "Thank You", rolls on a fixed clock, and only then counts as read', async () => {
        render(<Credits />);

        await vi.advanceTimersByTimeAsync(CREDITS_HOLD_MS + CREDITS_SCROLL_MS - 100);
        expect(mockNotifyAutoplay).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(200);
        expect(mockNotifyAutoplay).toHaveBeenCalledTimes(1);
        expect(mockNotifyAutoplay).toHaveBeenCalledWith({ type: 'summary-playback-finished' });
    });

    it('starts a new meeting on a click anywhere at an installation', () => {
        render(<Credits />);

        fireEvent.pointerDown(window);

        expect(mockNavigate).toHaveBeenCalledWith('/en/');
    });

    it('eases in and out of a steady roll: it starts and ends at rest and never races in the middle', () => {
        expect(creditsRollPosition(0)).toBe(0);
        expect(creditsRollPosition(0.5)).toBeCloseTo(0.5);
        expect(creditsRollPosition(1)).toBeCloseTo(1);
        const speed = (t: number) => (creditsRollPosition(t + 0.001) - creditsRollPosition(t)) / 0.001;
        expect(speed(0)).toBeLessThan(0.1);
        expect(speed(0.999)).toBeLessThan(0.1);
        expect(speed(0.5)).toBeLessThan(1.2);
    });
});
