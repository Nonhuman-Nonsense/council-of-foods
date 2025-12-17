import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import OverlayWrapper from '../../../src/components/OverlayWrapper';
import React from 'react';

// Mock utils
vi.mock('../../../src/utils', () => ({
    useMobile: vi.fn(() => false),
    useMobileXs: vi.fn(() => false),
    usePortrait: vi.fn(() => false),
}));

describe('OverlayWrapper', () => {
    it('renders children correctly', () => {
        const removeOverlay = vi.fn();
        render(
            <OverlayWrapper removeOverlay={removeOverlay}>
                <div data-testid="child-content">Child Content</div>
            </OverlayWrapper>
        );

        expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });

    it('renders close button when showX is true', () => {
        const removeOverlay = vi.fn();
        render(
            <OverlayWrapper showX={true} removeOverlay={removeOverlay}>
                <div>Content</div>
            </OverlayWrapper>
        );

        const closeButton = screen.getByAltText('close');
        expect(closeButton).toBeInTheDocument();
    });

    it('does not render close button when showX is false', () => {
        const removeOverlay = vi.fn();
        render(
            <OverlayWrapper showX={false} removeOverlay={removeOverlay}>
                <div>Content</div>
            </OverlayWrapper>
        );

        const closeButton = screen.queryByAltText('close');
        expect(closeButton).not.toBeInTheDocument();
    });

    it('calls removeOverlay when close button is clicked', () => {
        const removeOverlay = vi.fn();
        render(
            <OverlayWrapper showX={true} removeOverlay={removeOverlay}>
                <div>Content</div>
            </OverlayWrapper>
        );

        const closeButton = screen.getByAltText('close');
        fireEvent.click(closeButton);
        expect(removeOverlay).toHaveBeenCalledTimes(1);
    });

    // Note: Testing the background clicks ('clickerStyle' divs) is a bit tricky relying on layout,
    // but we can check if there are clickable elements that trigger the function.
    // The component structure has multiple divs with onClick=removeOverlay.
});
