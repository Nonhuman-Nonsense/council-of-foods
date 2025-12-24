import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import TextOutput from '../../../src/components/TextOutput';

// Mock utils
vi.mock('../../../src/utils', () => ({
    useMobile: () => false,
}));

describe('TextOutput', () => {
    // Fake Timers are essential here because the component relies on 
    // Date.now() and requestAnimationFrame.
    beforeEach(() => {
        vi.useFakeTimers();
        // requestAnimationFrame mock is often needed in JSDOM, 
        // though recent jsdom versions support it better. 
        // Vitest's fake timers should handle it if 'shouldAdvanceTime' is true,
        // but explicit mocking gives us frame control.
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const mockAudioMessage = {
        sentences: [
            { text: "Hello world.", start: 0.0, end: 1.0 },
            { text: "This is a test.", start: 1.0, end: 2.5 },
            { text: "Ending now.", start: 2.5, end: 3.0 }
        ]
    };

    const defaultProps = {
        currentTextMessage: { speaker: "Alice" }, // Not actually used by component directly?
        currentAudioMessage: mockAudioMessage,
        isPaused: false,
        setCurrentSnippetIndex: vi.fn(),
        setSentencesLength: vi.fn(),
    };

    it('initializes with the first sentence', () => {
        render(<TextOutput {...defaultProps} />);

        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('Hello world.');
    });

    it('updates text as time progresses', () => {
        render(<TextOutput {...defaultProps} />);

        // Move forward 1.1 seconds (should be second sentence)
        act(() => {
            vi.advanceTimersByTime(1100);
        });

        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('This is a test.');
        expect(defaultProps.setCurrentSnippetIndex).toHaveBeenCalledWith(1);

        // Move forward to 2.6 seconds (should be third sentence)
        act(() => {
            vi.advanceTimersByTime(1500);
        });

        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('Ending now.');
        expect(defaultProps.setCurrentSnippetIndex).toHaveBeenCalledWith(2);
    });

    it('does not advance when paused', () => {
        const { rerender } = render(<TextOutput {...defaultProps} isPaused={true} />);

        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('Hello world.');

        act(() => {
            vi.advanceTimersByTime(5000); // Massive usage of time
        });

        // Should still be at start
        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('Hello world.');

        // Unpause
        rerender(<TextOutput {...defaultProps} isPaused={false} />);

        // Now it should start counting from 0 (relative to the unpause)
        // Implementation check: Resume logic uses 'accumulatedTimeRef'.
        // If we paused at t=0, accumulated is 0. 

        act(() => {
            vi.advanceTimersByTime(1100);
        });

        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('This is a test.');
    });

    it('resumes correctly after pausing mid-stream', () => {
        const { rerender } = render(<TextOutput {...defaultProps} isPaused={false} />);

        // Play for 0.5s (still first sentence)
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('Hello world.');

        // Pause
        rerender(<TextOutput {...defaultProps} isPaused={true} />);

        // Wait 10 seconds while paused
        act(() => {
            vi.advanceTimersByTime(10000);
        });
        // Should not have changed
        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('Hello world.');

        // Play again
        rerender(<TextOutput {...defaultProps} isPaused={false} />);

        // Play for 0.6s. Total played time = 0.5 + 0.6 = 1.1s. 
        // Should now be on second sentence.
        act(() => {
            vi.advanceTimersByTime(600);
        });

        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('This is a test.');
    });
});
