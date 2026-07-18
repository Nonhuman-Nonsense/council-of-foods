import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FullscreenButton from '@main/FullscreenButton';

describe('FullscreenButton', () => {

    const requestFullscreenMock = vi.fn();
    const exitFullscreenMock = vi.fn();

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('requests fullscreen when clicked and not currently fullscreen', () => {
        // Setup mock
        document.documentElement.requestFullscreen = requestFullscreenMock;
        // Mock fullscreenElement to be null
        Object.defineProperty(document, 'fullscreenElement', {
            configurable: true,
            value: null,
        });

        render(<FullscreenButton />);

        const button = screen.getByLabelText(/Open fullscreen/i);
        fireEvent.click(button);

        expect(requestFullscreenMock).toHaveBeenCalled();
    });

    it('exits fullscreen when clicked and currently fullscreen', () => {
        // Setup mock
        document.exitFullscreen = exitFullscreenMock;

        // Mock fullscreenElement to be something
        Object.defineProperty(document, 'fullscreenElement', {
            configurable: true,
            value: document.createElement('div'),
        });

        render(<FullscreenButton />);

        // Sync state
        fireEvent(document, new Event('fullscreenchange'));

        // Should show Close icon
        const button = screen.getByLabelText(/Close fullscreen/i);
        fireEvent.click(button);

        expect(exitFullscreenMock).toHaveBeenCalled();
    });

    it('render proper icon based on state', () => {
        // Default (Start)
        Object.defineProperty(document, 'fullscreenElement', {
            configurable: true,
            value: null,
        });
        const { unmount } = render(<FullscreenButton />);
        expect(screen.getByLabelText('Open fullscreen')).toBeInTheDocument();
        unmount();

        // Entered
        Object.defineProperty(document, 'fullscreenElement', {
            configurable: true,
            value: document.createElement('div'),
        });

        // The component's isFullscreen state always starts false and only updates
        // via the fullscreenchange listener, so setting fullscreenElement alone
        // isn't enough — the event must fire for the icon to switch.
        render(<FullscreenButton />);
        fireEvent(document, new Event('fullscreenchange'));

        expect(screen.getByLabelText('Close fullscreen')).toBeInTheDocument();
    });
});
