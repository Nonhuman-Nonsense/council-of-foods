import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import FoodItem from '@council/FoodItem';
import { dvh } from '@/utils';
import type { CSSProperties } from 'react';
import type { Character } from '@shared/ModelTypes';

// Mock the child component FoodAnimation to isolate FoodItem testing
// But actually FoodAnimation is simple enough we might want to test the composition.
// However, FoodAnimation uses video APIs which are not fully implemented in JSDOM.
// Let's mock it to avoid video.play() errors and focus on FoodItem logic.
vi.mock('@council/FoodAnimation', () => ({
    default: ({ food, styles, isPerforming }: { food: { id: string }; styles: CSSProperties; isPerforming: boolean }) => (
        <div data-testid={`food-animation-${food.id}`} style={styles}>
            Video for {food.id}
            {isPerforming ? ' (Breathing)' : ' (Idle)'}
        </div>
    )
}));

const mockFood: Character = {
    id: 'banana',
    name: 'Banana',
    voice: 'alloy',
    description: 'A cheerful banana',
    prompt: 'You are a banana.',
    size: 1, // Standard size
};

describe('FoodItem', () => {
    it('renders correctly in overview mode', () => {
        // Total 3 items, this is index 1 (middle): left = 1/(3-1) * 100 = 50%,
        // top = a*(index-middleIndex)^2 + topMax - topOffset = 0 + 3 - 14.5 = -11.5vw.
        render(
            <FoodItem
                food={mockFood}
                index={1}
                total={3}
                currentSpeakerId=""
                isPaused={false}
                zoomIn={false}
            />
        );

        const container = screen.getByTestId('food-animation-banana').parentElement;
        expect(screen.getByTestId('food-animation-banana')).toBeInTheDocument();
        expect(container).toHaveStyle({ left: '50%', top: 'calc(-11.5vw)', opacity: '1' });
    });

    it('renders correctly when zoomed in (active speaker)', () => {
        render(
            <FoodItem
                food={mockFood}
                index={1}
                total={3}
                currentSpeakerId="banana"
                isPaused={false}
                zoomIn={true}
            />
        );

        // Verify it thinks it's the active speaker, and gets banana's manual
        // vertical adjustment (baseHeight -20 instead of the default -19).
        expect(screen.getByText('Video for banana (Breathing)')).toBeInTheDocument();
        const container = screen.getByTestId('food-animation-banana').parentElement;
        expect(container).toHaveStyle({ top: `calc(-20${dvh})` });
    });

    it('renders correctly when zoomed in (inactive speaker)', () => {
        render(
            <FoodItem
                food={mockFood}
                index={1}
                total={3}
                currentSpeakerId="apple" // Someone else
                isPaused={false}
                zoomIn={true}
            />
        );

        // zoomIn is true but this food isn't the active speaker, so it falls
        // back to the overview-position branch, just hidden via opacity.
        const container = screen.getByTestId('food-animation-banana').parentElement;
        expect(container).toHaveStyle({ opacity: '0' });
    });

    it('stays zoomed and visible when focused but not performing (meta-agent idle)', () => {
        const waterFood: Character = { ...mockFood, id: 'water' };
        render(
            <FoodItem
                food={waterFood}
                index={0}
                total={3}
                currentSpeakerId="water"
                isPerforming={false}
                isPaused={false}
                zoomIn={true}
            />
        );

        expect(screen.getByText('Video for water (Idle)')).toBeInTheDocument();
        const container = screen.getByTestId('food-animation-water').parentElement;
        expect(container).not.toHaveStyle({ opacity: '0' });
        // 'water' gets no manual adjustment, so the default baseHeight (-19) applies.
        expect(container).toHaveStyle({ top: `calc(-19${dvh})` });
    });

    it('calculates position correctly for different indices', () => {
        // index 0 of 3: left = 0%, top = a*(0-1)^2 + 3 - 14.5 = 3 + 3 - 14.5 = -8.5vw.
        const result0 = render(
            <FoodItem
                food={mockFood}
                index={0}
                total={3}
                currentSpeakerId=""
                isPaused={false}
                zoomIn={false}
            />
        );
        expect(within(result0.container).getByTestId('food-animation-banana').parentElement).toHaveStyle({
            left: '0%',
            top: 'calc(-8.5vw)',
        });

        // index 2 of 3: left = 2/2 * 100 = 100%, top = a*(2-1)^2 + 3 - 14.5 = -8.5vw (symmetric).
        const result2 = render(
            <FoodItem
                food={mockFood}
                index={2}
                total={3}
                currentSpeakerId=""
                isPaused={false}
                zoomIn={false}
            />
        );
        expect(within(result2.container).getByTestId('food-animation-banana').parentElement).toHaveStyle({
            left: '100%',
            top: 'calc(-8.5vw)',
        });
    });

    it('should apply special positioning for lollipop', () => {
        const lollipopFood = { ...mockFood, id: 'lollipop' };
        render(
            <FoodItem
                food={lollipopFood}
                index={1}
                total={3}
                currentSpeakerId=""
                isPaused={false}
                zoomIn={false}
            />
        );
        // Same base top as any index-1-of-3 food (-11.5vw), scaled by lollipop's 1.05 adjustment.
        expect(screen.getByTestId('food-animation-lollipop')).toBeInTheDocument();
        const container = screen.getByTestId('food-animation-lollipop').parentElement;
        expect(container).toHaveStyle({ left: '50%', top: 'calc(-12.075vw)' });
    });

    it('should handle food with missing id gracefully', () => {
        // Deliberately violates the Character contract to verify graceful degradation.
        const noIdFood = { ...mockFood, id: undefined } as unknown as Character;
        render(
            <FoodItem
                food={noIdFood}
                index={1}
                total={3}
                currentSpeakerId=""
                isPaused={false}
                zoomIn={false}
            />
        );
        // Should rely on fallback visualization or at least not crash
        // Our mock FoodAnimation renders "Video for undefined" if id is missing
        expect(screen.getByTestId('food-animation-undefined')).toBeInTheDocument();
    });
});
