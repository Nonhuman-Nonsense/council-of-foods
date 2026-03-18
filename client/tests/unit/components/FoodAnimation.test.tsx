import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import FoodAnimation from '../../../src/components/FoodAnimation';
import { Food } from '../../../src/components/settings/SelectFoods';

// Mock video play/pause
const originalPlay = window.HTMLMediaElement.prototype.play;
const originalPause = window.HTMLMediaElement.prototype.pause;

describe('FoodAnimation', () => {
    let playMock: Mock;
    let pauseMock: Mock;

    beforeEach(() => {
        playMock = vi.fn().mockResolvedValue(undefined);
        pauseMock = vi.fn();
        window.HTMLMediaElement.prototype.play = playMock;
        window.HTMLMediaElement.prototype.pause = pauseMock;
    });

    afterEach(() => {
        window.HTMLMediaElement.prototype.play = originalPlay;
        window.HTMLMediaElement.prototype.pause = originalPause;
        vi.clearAllMocks();
    });

    const mockFood: Food = {
        id: 'banana',
        size: 1,
        name: 'Banana',
        description: 'A yellow fruit',
        type: 'fruit'
    };
    const mockStyles = { width: '100px' };

    it('renders video element with correct sources', () => {
        render(
            <FoodAnimation
                food={mockFood}
                styles={mockStyles}
                currentSpeakerId=""
                isPaused={false}
            />
        );

        const video = screen.getByTestId('food-video');
        expect(video).toBeInTheDocument();
        expect(video).toHaveStyle(mockStyles);

        const sources = video.querySelectorAll('source');
        expect(sources).toHaveLength(2);
        expect(sources[0]).toHaveAttribute('src', '/foods/videos/banana-hevc-safari.mp4');
        expect(sources[1]).toHaveAttribute('src', '/foods/videos/banana-vp9-chrome.webm');
    });

    it('pauses video initially after mount (safari fix)', async () => {
        render(
            <FoodAnimation
                food={mockFood}
                styles={mockStyles}
                currentSpeakerId=""
                isPaused={false}
            />
        );

        // The component plays then immediately pauses on mount
        await act(async () => {
            // Wait for useEffect
        });

        expect(playMock).toHaveBeenCalled();
        expect(pauseMock).toHaveBeenCalled();
    });

    it('plays video when active speaker matches food id', async () => {
        const { rerender } = render(
            <FoodAnimation
                food={mockFood}
                styles={mockStyles}
                currentSpeakerId=""
                isPaused={false}
            />
        );

        // Wait for initial mount logic
        await act(async () => { });
        playMock.mockClear();
        pauseMock.mockClear();

        // Update to be active speaker
        rerender(
            <FoodAnimation
                food={mockFood}
                styles={mockStyles}
                currentSpeakerId="banana"
                isPaused={false}
            />
        );

        await act(async () => { });
        expect(playMock).toHaveBeenCalled();
        expect(pauseMock).not.toHaveBeenCalled();
    });

    it('pauses video when active speaker changes to someone else', async () => {
        const { rerender } = render(
            <FoodAnimation
                food={mockFood}
                styles={mockStyles}
                currentSpeakerId="banana"
                isPaused={false}
            />
        );

        await act(async () => { });

        // Update to different speaker
        rerender(
            <FoodAnimation
                food={mockFood}
                styles={mockStyles}
                currentSpeakerId="apple"
                isPaused={false}
            />
        );

        await act(async () => { });
        expect(pauseMock).toHaveBeenCalled();
    });

    it('pauses video when isPaused becomes true', async () => {
        const { rerender } = render(
            <FoodAnimation
                food={mockFood}
                styles={mockStyles}
                currentSpeakerId="banana"
                isPaused={false}
            />
        );

        await act(async () => { });

        rerender(
            <FoodAnimation
                food={mockFood}
                styles={mockStyles}
                currentSpeakerId="banana"
                isPaused={true}
            />
        );

        await act(async () => { });
        expect(pauseMock).toHaveBeenCalled();
    });

    it('should not render video if food.id is missing', () => {
        const noIdFood = { ...mockFood, id: undefined } as unknown as Food;
        render(
            <FoodAnimation
                food={noIdFood}
                styles={mockStyles}
                currentSpeakerId=""
                isPaused={false}
            />
        );

        const video = screen.queryByTestId('food-video');
        expect(video).not.toBeInTheDocument();
    });
});
