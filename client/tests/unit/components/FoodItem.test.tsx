import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import FoodItem from '@council/FoodItem';
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
        // Total 3 items, this is index 1 (middle)
        const { asFragment } = render(
            <FoodItem
                food={mockFood}
                index={1}
                total={3}
                currentSpeakerId=""
                isPaused={false}
                zoomIn={false}
            />
        );

        expect(screen.getByTestId('food-animation-banana')).toBeInTheDocument();
        // Snapshot will capture the calculated style logic (position, width, etc.)
        expect(asFragment()).toMatchSnapshot();
    });

    it('renders correctly when zoomed in (active speaker)', () => {
        const { asFragment } = render(
            <FoodItem
                food={mockFood}
                index={1}
                total={3}
                currentSpeakerId="banana"
                isPaused={false}
                zoomIn={true}
            />
        );

        // Verify it thinks it's the active speaker
        expect(screen.getByText('Video for banana (Breathing)')).toBeInTheDocument();
        expect(asFragment()).toMatchSnapshot();
    });

    it('renders correctly when zoomed in (inactive speaker)', () => {
        const { asFragment } = render(
            <FoodItem
                food={mockFood}
                index={1}
                total={3}
                currentSpeakerId="apple" // Someone else
                isPaused={false}
                zoomIn={true}
            />
        );

        const container = screen.getByTestId('food-animation-banana').parentElement;
        expect(container).toHaveStyle({ opacity: '0' });
        expect(asFragment()).toMatchSnapshot();
    });

    it('stays zoomed and visible when focused but not performing (meta-agent idle)', () => {
        const waterFood: Character = { ...mockFood, id: 'water' };
        const { asFragment } = render(
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
        expect(asFragment()).toMatchSnapshot();
    });

    it('calculates position correctly for different indices', () => {
        // Test index 0 of 3
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
        // Snapshot captures 'left: 0%' roughly
        expect(result0.asFragment()).toMatchSnapshot();

        // Test index 2 of 3
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
        // Snapshot captures 'left: 100%' roughly
        expect(result2.asFragment()).toMatchSnapshot();
    });
    it('should apply special positioning for lollipop', () => {
        const lollipopFood = { ...mockFood, id: 'lollipop' };
        // We can't easily assert exact style values due to complex math, but we can snapshot it
        // Or check if it renders without error and has the correct id
        const { asFragment } = render(
            <FoodItem
                food={lollipopFood}
                index={1}
                total={3}
                currentSpeakerId=""
                isPaused={false}
                zoomIn={false}
            />
        );
        expect(screen.getByTestId('food-animation-lollipop')).toBeInTheDocument();
        expect(asFragment()).toMatchSnapshot();
    });

    it('should handle food with missing id gracefully', () => {
        // Deliberately violates the Character contract to verify graceful degradation.
        const noIdFood = { ...mockFood, id: undefined } as unknown as Character;
        const { asFragment } = render(
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
        expect(asFragment()).toMatchSnapshot();
    });
});
