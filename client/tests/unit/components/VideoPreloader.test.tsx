import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import VideoPreloader from '@main/VideoPreloader';
import { characterSetupEn } from '../../characterSetupTestData';

const [, firstCharacter, secondCharacter] = characterSetupEn.characters;

describe('VideoPreloader', () => {
    it('renders empty container when list is empty', () => {
        const { container } = render(<VideoPreloader foodIds={[]} />);
        const div = container.firstChild as HTMLElement;
        expect(div.children).toHaveLength(0);
    });

    it('renders hidden video elements for provided food IDs', () => {
        const foodIds = [firstCharacter.id, secondCharacter.id];
        const { container } = render(<VideoPreloader foodIds={foodIds} />);

        const div = container.firstChild as HTMLElement;
        expect(div).toHaveStyle({ display: 'none', width: '0', height: '0' });

        const videos = div.querySelectorAll('video');
        expect(videos).toHaveLength(2);

        const firstVideo = videos[0];
        expect(firstVideo).toHaveAttribute('preload', 'auto');
        expect(firstVideo).toHaveProperty('muted', true);
        expect(firstVideo).toHaveProperty('playsInline', true);

        const sources = firstVideo.querySelectorAll('source');
        expect(sources).toHaveLength(2);
        expect(sources[0].getAttribute('src')).toContain(`${firstCharacter.id}-hevc-safari`);
        expect(sources[0]).toHaveAttribute('type', 'video/mp4; codecs="hvc1"');
        expect(sources[1].getAttribute('src')).toContain(`${firstCharacter.id}-vp9-chrome`);
        expect(sources[1]).toHaveAttribute('type', 'video/webm');
    });
});
