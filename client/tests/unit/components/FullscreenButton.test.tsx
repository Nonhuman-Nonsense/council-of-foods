import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FullscreenButton from '../../../src/components/FullscreenButton';

describe('FullscreenButton', () => {

    // Mocking document methods
    const requestFullscreenMock = vi.fn();
    const exitFullscreenMock = vi.fn();

    // Preserve original implementations
    const originalDocElement = document.documentElement;
    const originalExit = document.exitFullscreen;

    afterEach(() => {
        vi.restoreAllMocks();
        // Restore document element property if we mess with it, 
        // but we are just attaching mocks to current instance usually.
        // Actually, we need to mock the property on the prototype or the instance.
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

        // We need to trigger the useEffect listener if we want to change it dynamically, 
        // but here we are just testing initial render based on state. 
        // Wait, the component uses `useState(false)` initially, 
        // and updates ONLY on `fullscreenchange` event.
        // So simply rendering with `document.fullscreenElement` set might NOT show correct state 
        // if the component initializes with false and only updates on event.
        // Let's check code: `const [isFullscreen, setIsFullscreen] = useState(false);`
        // So it starts false. We need to trigger the event.

        render(<FullscreenButton />);

        // Simulate event
        fireEvent(document, new Event('fullscreenchange'));

        // Now it should update
        expect(screen.getByLabelText('Close fullscreen')).toBeInTheDocument();
    });
});
