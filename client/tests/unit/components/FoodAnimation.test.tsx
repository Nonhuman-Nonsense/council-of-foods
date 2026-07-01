import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import FoodAnimation from '@council/FoodAnimation';
import type { Character } from '@newMeeting/SelectCharacters';
import { characterSetupEn } from '../../characterSetupTestData';

const [, sampleCharacter, otherCharacter] = characterSetupEn.characters;
const otherSpeakerId = otherCharacter?.id ?? 'other-speaker';

const originalPlay = window.HTMLMediaElement.prototype.play;
const originalPause = window.HTMLMediaElement.prototype.pause;

describe('FoodAnimation', () => {
    let playMock: Mock;
    let pauseMock: Mock;

    const mockFood: Character = {
        id: sampleCharacter.id,
        size: 1,
        name: sampleCharacter.name,
        description: sampleCharacter.description,
        prompt: sampleCharacter.prompt ?? '',
        voice: 'alloy',
    };
    const mockStyles = { width: '100px' };

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

    it('renders video element with correct sources', () => {
        render(
            <FoodAnimation
                food={mockFood}
                styles={mockStyles}
                isPerforming={false}
                isPaused={false}
            />
        );

        const video = screen.getByTestId('food-video');
        expect(video).toBeInTheDocument();
        expect(video).toHaveStyle(mockStyles);

        const sources = video.querySelectorAll('source');
        expect(sources).toHaveLength(2);
        expect(sources[0].getAttribute('src')).toContain(`${sampleCharacter.id}-hevc-safari`);
        expect(sources[1].getAttribute('src')).toContain(`${sampleCharacter.id}-vp9-chrome`);
    });

    it('pauses video initially after mount (safari fix)', async () => {
        render(
            <FoodAnimation
                food={mockFood}
                styles={mockStyles}
                isPerforming={false}
                isPaused={false}
            />
        );

        await act(async () => {});

        expect(playMock).toHaveBeenCalled();
        expect(pauseMock).toHaveBeenCalled();
    });

    it('plays video when isPerforming is true', async () => {
        const { rerender } = render(
            <FoodAnimation
                food={mockFood}
                styles={mockStyles}
                isPerforming={false}
                isPaused={false}
            />
        );

        await act(async () => { });
        playMock.mockClear();
        pauseMock.mockClear();

        rerender(
            <FoodAnimation
                food={mockFood}
                styles={mockStyles}
                isPerforming={true}
                isPaused={false}
            />
        );

        await act(async () => { });
        expect(playMock).toHaveBeenCalled();
        expect(pauseMock).not.toHaveBeenCalled();
    });

    it('pauses video when isPerforming becomes false', async () => {
        const { rerender } = render(
            <FoodAnimation
                food={mockFood}
                styles={mockStyles}
                isPerforming={true}
                isPaused={false}
            />
        );

        await act(async () => { });

        rerender(
            <FoodAnimation
                food={mockFood}
                styles={mockStyles}
                isPerforming={false}
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
                isPerforming={true}
                isPaused={false}
            />
        );

        await act(async () => { });

        rerender(
            <FoodAnimation
                food={mockFood}
                styles={mockStyles}
                isPerforming={true}
                isPaused={true}
            />
        );

        await act(async () => { });
        expect(pauseMock).toHaveBeenCalled();
    });

    it('should not render video if food.id is missing', () => {
        const noIdFood = { ...mockFood, id: undefined } as unknown as Character;
        render(
            <FoodAnimation
                food={noIdFood}
                styles={mockStyles}
                isPerforming={false}
                isPaused={false}
            />
        );

        const video = screen.queryByTestId('food-video');
        expect(video).not.toBeInTheDocument();
    });
});
