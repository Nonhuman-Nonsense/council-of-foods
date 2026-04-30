import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import FoodAnimation from '@council/FoodAnimation';

vi.mock('lottie-web', () => ({
    default: {
        loadAnimation: vi.fn(() => ({
            play: vi.fn(),
            stop: vi.fn(),
            destroy: vi.fn()
        }))
    }
}));

describe('FoodAnimation Compatibility', () => {
    it('accepts Forest-specific props without crashing', () => {
        const { container } = render(
            <FoodAnimation
                character={{ id: "river" }}
                isPaused={false}
                currentSpeakerId=""
                styles={{}}
            />
        );
        expect(container).toBeInTheDocument();
    });

    it('handles legacy Foods props gracefully (ignores emotion)', () => {
        const { container } = render(
            <FoodAnimation
                character={{ id: "river", emotion: "happy" }}
                isPaused={false}
                currentSpeakerId=""
                styles={{}}
            />
        );
        expect(container).toBeInTheDocument();
    });
});
