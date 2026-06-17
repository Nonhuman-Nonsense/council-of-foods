import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import FoodAnimation from '@council/FoodAnimation';
import type { Character } from '@newMeeting/SelectCharacters';
import { characterSetupEn } from '../../characterSetupTestData';

const [, sampleCharacter, otherCharacter] = characterSetupEn.characters;
const otherSpeakerId = otherCharacter?.id ?? 'other-speaker';

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

    const mockCharacter: Character = {
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
        vi.mocked(useMobile).mockReturnValue(false);
    });

    afterEach(() => {
        window.HTMLMediaElement.prototype.play = originalPlay;
        window.HTMLMediaElement.prototype.pause = originalPause;
        vi.clearAllMocks();
    });

    it('renders video element with correct sources', () => {
        render(
            <FoodAnimation
                character={mockCharacter}
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
        expect(sources[0].getAttribute('src')).toContain(`${sampleCharacter.id}-hevc-safari`);
        expect(sources[1].getAttribute('src')).toContain(`${sampleCharacter.id}-vp9-chrome`);
    });

    it('pauses video initially after mount (safari fix)', async () => {
        render(
            <FoodAnimation
                character={mockCharacter}
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
                character={mockCharacter}
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
                character={mockCharacter}
                styles={mockStyles}
                currentSpeakerId={sampleCharacter.id}
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
                character={mockCharacter}
                styles={mockStyles}
                currentSpeakerId={sampleCharacter.id}
                isPaused={false}
            />
        );

        await act(async () => {});

        rerender(
            <FoodAnimation
                character={mockCharacter}
                styles={mockStyles}
                currentSpeakerId={otherSpeakerId}
                isPaused={false}
            />
        );

        await act(async () => {});
        expect(pauseMock).toHaveBeenCalled();
    });

    it('pauses video when isPaused becomes true', async () => {
        const { rerender } = render(
            <FoodAnimation
                character={mockCharacter}
                styles={mockStyles}
                currentSpeakerId={sampleCharacter.id}
                isPaused={false}
            />
        );

        await act(async () => {});

        rerender(
            <FoodAnimation
                character={mockCharacter}
                styles={mockStyles}
                currentSpeakerId={sampleCharacter.id}
                isPaused={true}
            />
        );

        await act(async () => {});
        expect(pauseMock).toHaveBeenCalled();
    });

    it('should not render video if food.id is missing', () => {
        const noIdCharacter = { ...mockCharacter, id: undefined } as unknown as Character;
        render(
            <FoodAnimation
                character={noIdCharacter}
                styles={mockStyles}
                currentSpeakerId=""
                isPaused={false}
            />
        );

        const video = screen.queryByTestId('food-video');
        expect(video).not.toBeInTheDocument();
    });
});
