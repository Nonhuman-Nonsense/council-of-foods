import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import TextOutput from '@council/output/TextOutput';

// Mock utils
vi.mock('@/utils', () => ({
    useMobile: () => false,
}));

describe('TextOutput', () => {
    let mockAudioContext: { currentTime: number };

    beforeEach(() => {
        vi.useFakeTimers();
        mockAudioContext = { currentTime: 0 };
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const mockAudioMessage = {
        id: 'msg1',
        sentences: [
            { text: "Hello world.", start: 0.0, end: 1.0 },
            { text: "This is a test.", start: 1.0, end: 2.5 },
            { text: "Ending now.", start: 2.5, end: 3.0 }
        ]
    };

    const defaultProps = () => ({
        currentAudioMessage: mockAudioMessage,
        audioContext: { current: mockAudioContext } as any,
        playbackStartInfo: { messageId: 'msg1', startedAtAudioContextTime: 0 },
        isPaused: false,
        setCurrentSnippetIndex: vi.fn(),
    });

    it('initializes with the first sentence', () => {
        const props = defaultProps();
        render(<TextOutput {...props} />);

        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('Hello world.');
        expect(props.setCurrentSnippetIndex).toHaveBeenCalledWith(0);
    });

    it('updates text as time progresses', () => {
        const props = defaultProps();
        render(<TextOutput {...props} />);

        act(() => {
            mockAudioContext.currentTime = 1.1;
            vi.advanceTimersByTime(16);
        });

        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('This is a test.');
        expect(props.setCurrentSnippetIndex).toHaveBeenCalledWith(1);

        act(() => {
            mockAudioContext.currentTime = 2.6;
            vi.advanceTimersByTime(16);
        });

        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('Ending now.');
        expect(props.setCurrentSnippetIndex).toHaveBeenCalledWith(2);
    });

    it('does not advance when paused', () => {
        const props = defaultProps();
        const { rerender } = render(<TextOutput {...props} isPaused={true} />);

        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('Hello world.');

        act(() => {
            mockAudioContext.currentTime = 5;
            vi.advanceTimersByTime(5000);
        });

        // Should still be at start
        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('Hello world.');

        // Unpause
        rerender(<TextOutput {...props} isPaused={false} />);

        act(() => {
            mockAudioContext.currentTime = 1.1;
            vi.advanceTimersByTime(16);
        });

        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('This is a test.');
    });

    it('resumes correctly after pausing mid-stream', () => {
        const props = defaultProps();
        const { rerender } = render(<TextOutput {...props} isPaused={false} />);

        act(() => {
            mockAudioContext.currentTime = 0.5;
            vi.advanceTimersByTime(16);
        });
        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('Hello world.');

        // Pause
        rerender(<TextOutput {...props} isPaused={true} />);

        // Wait 10 seconds while paused
        act(() => {
            vi.advanceTimersByTime(10000);
        });
        // Should not have changed
        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('Hello world.');

        rerender(<TextOutput {...props} isPaused={false} />);

        act(() => {
            mockAudioContext.currentTime = 1.1;
            vi.advanceTimersByTime(16);
        });

        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('This is a test.');
    });

    it('handles null audio message gracefully', () => {
        const props = defaultProps();
        render(<TextOutput {...props} currentAudioMessage={null} />);
        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('');
        expect(props.setCurrentSnippetIndex).toHaveBeenCalledWith(0);
    });

    it('handles empty sentences array gracefully', () => {
        const props = defaultProps();
        render(<TextOutput {...props} currentAudioMessage={{ sentences: [] }} />);
        expect(screen.getByTestId('subtitle-text')).toHaveTextContent('');
        expect(props.setCurrentSnippetIndex).toHaveBeenCalledWith(0);
    });
});
