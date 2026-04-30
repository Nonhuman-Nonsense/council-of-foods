import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import FoodAnimation from '@council/FoodAnimation';
import { MeetingCharacter } from '@newMeeting/SelectCharacters';

vi.mock('../../../src/utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/utils')>();
    return {
        ...actual,
        useMobile: vi.fn(),
    };
});

import { useMobile } from '../../../src/utils';

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
        vi.mocked(useMobile).mockReturnValue(false);
    });

    afterEach(() => {
        window.HTMLMediaElement.prototype.play = originalPlay;
        window.HTMLMediaElement.prototype.pause = originalPause;
        vi.clearAllMocks();
    });

    const mockFood: MeetingCharacter = {
        id: 'reindeer',
        size: 1,
        name: 'Reindeer',
        description: 'Test',
        type: 'food',
        voice: 'alloy',
    };
    const mockStyles = { width: '100px' };

    it('renders video element with correct sources', () => {
        render(
            <FoodAnimation
                character={mockFood}
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
        expect(sources[0].getAttribute('src')).toContain('reindeer-hevc-safari');
        expect(sources[1].getAttribute('src')).toContain('reindeer-vp9-chrome');
    });

    it('pauses video initially after mount (safari fix)', async () => {
        render(
            <FoodAnimation
                character={mockFood}
                styles={mockStyles}
                currentSpeakerId=""
                isPaused={false}
            />
        );

        await act(async () => {});

        expect(playMock).toHaveBeenCalled();
        expect(pauseMock).toHaveBeenCalled();
    });

    it('plays video when active speaker matches food id', async () => {
        const { rerender } = render(
            <FoodAnimation
                character={mockFood}
                styles={mockStyles}
                currentSpeakerId=""
                isPaused={false}
            />
        );

        await act(async () => {});
        playMock.mockClear();
        pauseMock.mockClear();

        rerender(
            <FoodAnimation
                character={mockFood}
                styles={mockStyles}
                currentSpeakerId="reindeer"
                isPaused={false}
            />
        );

        await act(async () => {});
        expect(playMock).toHaveBeenCalled();
        expect(pauseMock).not.toHaveBeenCalled();
    });

    it('pauses video when active speaker changes to someone else', async () => {
        const { rerender } = render(
            <FoodAnimation
                character={mockFood}
                styles={mockStyles}
                currentSpeakerId="reindeer"
                isPaused={false}
            />
        );

        await act(async () => {});

        rerender(
            <FoodAnimation
                character={mockFood}
                styles={mockStyles}
                currentSpeakerId="lichen"
                isPaused={false}
            />
        );

        await act(async () => {});
        expect(pauseMock).toHaveBeenCalled();
    });

    it('pauses video when isPaused becomes true', async () => {
        const { rerender } = render(
            <FoodAnimation
                character={mockFood}
                styles={mockStyles}
                currentSpeakerId="reindeer"
                isPaused={false}
            />
        );

        await act(async () => {});

        rerender(
            <FoodAnimation
                character={mockFood}
                styles={mockStyles}
                currentSpeakerId="reindeer"
                isPaused={true}
            />
        );

        await act(async () => {});
        expect(pauseMock).toHaveBeenCalled();
    });

    it('should not render video if food.id is missing', () => {
        const noIdFood = { ...mockFood, id: undefined } as unknown as MeetingCharacter;
        render(
            <FoodAnimation
                character={noIdFood}
                styles={mockStyles}
                currentSpeakerId=""
                isPaused={false}
            />
        );

        const video = screen.queryByTestId('food-video');
        expect(video).not.toBeInTheDocument();
    });
});
