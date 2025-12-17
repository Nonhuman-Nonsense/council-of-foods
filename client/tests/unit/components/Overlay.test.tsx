import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Overlay from '../../../src/components/Overlay';

describe('Overlay', () => {
    it('renders children correctly', () => {
        render(
            <Overlay isActive={true}>
                <div data-testid="child">Child Content</div>
            </Overlay>
        );

        expect(screen.getByTestId('child')).toBeInTheDocument();
        expect(screen.getByText('Child Content')).toBeInTheDocument();
    });

    it('has pointer-events auto when active', () => {
        render(
            <Overlay isActive={true}>
                <div>Content</div>
            </Overlay>
        );

        // Get the structural wrapper div (the component returns a single div)
        // Since it doesn't have a role or text, we can look at the container's first child
        // or add a data-testid to the component if we were modifying it. 
        // But better is to just look for the text's parent.
        const content = screen.getByText('Content');
        const overlay = content.parentElement;

        expect(overlay).toHaveStyle({ pointerEvents: 'auto' });
        expect(overlay).toHaveStyle({ backgroundColor: 'rgba(0, 0, 0, 0.5)' });
    });

    it('has pointer-events none and no background when inactive', () => {
        render(
            <Overlay isActive={false}>
                <div>Content</div>
            </Overlay>
        );

        const content = screen.getByText('Content');
        const overlay = content.parentElement;

        expect(overlay).toHaveStyle({ pointerEvents: 'none' });
        // Style check for "undefined" background might fail depending on JSDOM, 
        // but typically it means empty string or transparent.
        // In our code: backgroundColor: isActive ? "..." : undefined
        // undefined in React style prop usually removes the style.
        expect(overlay?.style.backgroundColor).toBe('');
    });

    it('applies blur class by default', () => {
        const { container } = render(
            <Overlay isActive={true}>
                <div>Content</div>
            </Overlay>
        );
        expect(container.firstChild).toHaveClass('blur');
    });

    it('removes blur class if isBlurred is false', () => {
        const { container } = render(
            <Overlay isActive={true} isBlurred={false}>
                <div>Content</div>
            </Overlay>
        );
        expect(container.firstChild).toHaveClass('blur hide');
    });

    it('hides blur if not active', () => {
        const { container } = render(
            <Overlay isActive={false}>
                <div>Content</div>
            </Overlay>
        );
        // Logic: isBlurred !== false && isActive === true ? "blur" : "blur hide"
        expect(container.firstChild).toHaveClass('blur hide');
    });
});
