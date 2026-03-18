import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Background } from '../../../src/components/Council'; // Importing the named export

describe('Background', () => {
    it('is hidden when not zoomed in', () => {
        // Background uses opacity to hide/show
        // closeUpBackdrop and closeUpTable have opacity: zoomIn ? "1" : "0"

        // Note: Background renders 4 divs.
        // 0: closeUpBackdrop
        // 1: closeUpTable
        // 2: bottomShade
        // 3: topShade

        const { container } = render(
            <Background zoomIn={false} currentSpeakerIndex={0} totalSpeakers={5} />
        );

        const divs = container.firstChild.querySelectorAll('div'); // Since it uses fragment, might need care
        // Actually render returns container which wraps the result. 
        // <Background> returns <><div/><div/>...</>
        // So container.children will be the divs.

        const backdrop = container.children[0];
        const table = container.children[1];

        expect(backdrop).toHaveStyle({ opacity: '0' });
        expect(table).toHaveStyle({ opacity: '0' });
    });

    it('is visible when zoomed in', () => {
        const { container } = render(
            <Background zoomIn={true} currentSpeakerIndex={0} totalSpeakers={5} />
        );

        const backdrop = container.children[0];
        expect(backdrop).toHaveStyle({ opacity: '1' });
    });

    it('shifts background position based on speaker index', () => {
        // Logic: 10 + (80 * currentSpeakerIndex) / totalSpeakers + "%"

        // Case A: Index 0, Total 10
        // 10 + (80 * 0) / 10 = 10%
        const { container, rerender } = render(
            <Background zoomIn={true} currentSpeakerIndex={0} totalSpeakers={10} />
        );
        expect(container.children[0]).toHaveStyle({ backgroundPosition: '10%' });

        // Case B: Index 5, Total 10 (Middle)
        // 10 + (80 * 5) / 10 = 10 + 40 = 50%
        rerender(
            <Background zoomIn={true} currentSpeakerIndex={5} totalSpeakers={10} />
        );
        expect(container.children[0]).toHaveStyle({ backgroundPosition: '50%' });

        // Case C: Index 10, Total 10 (End)
        // 10 + (80 * 10) / 10 = 10 + 80 = 90%
        rerender(
            <Background zoomIn={true} currentSpeakerIndex={10} totalSpeakers={10} />
        );
        expect(container.children[0]).toHaveStyle({ backgroundPosition: '90%' });
    });
});
