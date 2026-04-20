import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import OverlayWrapper from '../../../src/components/OverlayWrapper';

// Mock utils
vi.mock('../../../src/utils', () => ({
    useMobile: vi.fn(() => false),
    useMobileXs: vi.fn(() => false),
    usePortrait: vi.fn(() => false),
}));

describe('OverlayWrapper', () => {
    it('renders children correctly', () => {
        const cancelOverlay = vi.fn();
        render(
            <OverlayWrapper cancelOverlay={cancelOverlay}>
                <div data-testid="child-content">Child Content</div>
            </OverlayWrapper>
        );

        expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });

    it('renders close button when showX is true', () => {
        const cancelOverlay = vi.fn();
        render(
            <OverlayWrapper showX={true} cancelOverlay={cancelOverlay}>
                <div>Content</div>
            </OverlayWrapper>
        );

        const closeButton = screen.getByLabelText('close');
        expect(closeButton).toBeInTheDocument();
    });

    it('does not render close button when showX is false', () => {
        const cancelOverlay = vi.fn();
        render(
            <OverlayWrapper showX={false} cancelOverlay={cancelOverlay}>
                <div>Content</div>
            </OverlayWrapper>
        );

        const closeButton = screen.queryByLabelText('close');
        expect(closeButton).not.toBeInTheDocument();
    });

    it('calls cancelOverlay when close button is clicked', () => {
        const cancelOverlay = vi.fn();
        render(
            <OverlayWrapper showX={true} cancelOverlay={cancelOverlay}>
                <div>Content</div>
            </OverlayWrapper>
        );

        const closeButton = screen.getByLabelText('close');
        fireEvent.click(closeButton);
        expect(cancelOverlay).toHaveBeenCalledTimes(1);
    });

    // Note: Testing the background clicks ('clickerStyle' divs) is a bit tricky relying on layout,
    // but we can check if there are clickable elements that trigger the function.
    // The component structure has multiple divs with onClick=cancelOverlay.
});
