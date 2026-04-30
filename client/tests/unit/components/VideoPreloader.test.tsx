import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import VideoPreloader from '@main/VideoPreloader';

vi.mock('../../../src/utils', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/utils')>();
    return {
        ...actual,
        useMobile: vi.fn(),
    };
});

import { useMobile } from '../../../src/utils';

describe('VideoPreloader', () => {
    beforeEach(() => {
        vi.mocked(useMobile).mockReturnValue(false);
    });

    it('renders empty container when list is empty', () => {
        const { container } = render(<VideoPreloader foodIds={[]} />);
        const div = container.firstChild as HTMLElement;
        expect(div.children).toHaveLength(0);
    });

    it('renders hidden video elements for provided food IDs', () => {
        const foods = ['reindeer', 'lichen'];
        const { container } = render(<VideoPreloader foodIds={foods} />);

        const div = container.firstChild as HTMLElement;
        expect(div).toHaveStyle({ display: 'none', width: '0', height: '0' });

        const videos = div.querySelectorAll('video');
        expect(videos).toHaveLength(2);

        const firstSources = videos[0].querySelectorAll('source');
        expect(firstSources).toHaveLength(2);
        expect(firstSources[0].getAttribute('src')).toContain('reindeer-hevc-safari');
        expect(firstSources[0]).toHaveAttribute('type', 'video/mp4; codecs="hvc1"');
        expect(firstSources[1].getAttribute('src')).toContain('reindeer-vp9-chrome');
        expect(firstSources[1]).toHaveAttribute('type', 'video/webm');
    });
});
