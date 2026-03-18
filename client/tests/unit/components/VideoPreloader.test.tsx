import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import VideoPreloader from '../../../src/components/VideoPreloader';

describe('VideoPreloader', () => {
    it('renders empty container when list is empty', () => {
        const { container } = render(<VideoPreloader foodIds={[]} />);
        const div = container.firstChild as HTMLElement;
        expect(div.children).toHaveLength(0);
    });

    it('renders hidden video elements for provided food IDs', () => {
        const foods = ['tomato', 'potato'];
        const { container } = render(<VideoPreloader foodIds={foods} />);

        const div = container.firstChild as HTMLElement;
        // Check hidden styles
        expect(div).toHaveStyle({ display: 'none', width: '0', height: '0' });

        const videos = div.querySelectorAll('video');
        expect(videos).toHaveLength(2);

        // Check first video (tomato)
        const tomatoVideo = videos[0];
        expect(tomatoVideo).toHaveAttribute('preload', 'auto');
        // Boolean attributes in testing-library check
        // Often 'muted' attribute is present as empty string or we can check property
        expect(tomatoVideo).toHaveProperty('muted', true);
        expect(tomatoVideo).toHaveProperty('playsInline', true);

        const sources = tomatoVideo.querySelectorAll('source');
        expect(sources).toHaveLength(2);
        expect(sources[0]).toHaveAttribute('src', '/foods/videos/tomato-hevc-safari.mp4');
        expect(sources[0]).toHaveAttribute('type', 'video/mp4; codecs="hvc1"');
        expect(sources[1]).toHaveAttribute('src', '/foods/videos/tomato-vp9-chrome.webm');
        expect(sources[1]).toHaveAttribute('type', 'video/webm');
    });
});
