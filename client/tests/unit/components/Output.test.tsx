import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Output from '../../../src/components/Output';
import React from 'react';
import { ConversationMessage } from '@shared/ModelTypes';
import { DecodedAudioMessage } from '@hooks/useCouncilMachine';

// Mock child components to verify props and rendering
vi.mock('../../../src/components/TextOutput', () => ({
    default: ({ currentTextMessage, style }: any) => (
        <div data-testid="mock-text-output" style={style}>
            {currentTextMessage ? currentTextMessage.text : 'No Text'}
        </div>
    ),
}));

vi.mock('../../../src/components/AudioOutput', () => ({
    default: ({ currentAudioMessage }: any) => (
        <div data-testid="mock-audio-output">
            {currentAudioMessage ? 'Audio Present' : 'No Audio'}
        </div>
    ),
}));

describe('Output', () => {
    const mockAudioContext = { current: {} } as any;
    const mockSetCurrentSnippetIndex = vi.fn();
    const mockSetSentencesLength = vi.fn();
    const mockHandleOnFinishedPlaying = vi.fn();

    const mockTextMessages: ConversationMessage[] = [
        { id: '1', text: 'Hello World', speaker: 'Speaker 1', type: 'human' },
        { id: '2', text: 'Second Message', speaker: 'Speaker 2', type: 'human' },
    ];

    const mockAudioMessages: DecodedAudioMessage[] = [
        { id: '1', audio: {} as AudioBuffer },
        { id: '2', audio: {} as AudioBuffer },
    ];

    const defaultProps = {
        textMessages: mockTextMessages,
        audioMessages: mockAudioMessages,
        playingNowIndex: 0,
        councilState: 'playing',
        isMuted: false,
        isPaused: false,
        currentSnippetIndex: 0,
        setCurrentSnippetIndex: mockSetCurrentSnippetIndex,
        audioContext: mockAudioContext,
        handleOnFinishedPlaying: mockHandleOnFinishedPlaying,
        setSentencesLength: mockSetSentencesLength,
    };

    it('renders TextOutput and AudioOutput', () => {
        render(<Output {...defaultProps} />);
        expect(screen.getByTestId('mock-text-output')).toBeInTheDocument();
        expect(screen.getByTestId('mock-audio-output')).toBeInTheDocument();
    });

    it('passes correct message based on playingNowIndex when playing', () => {
        render(<Output {...defaultProps} playingNowIndex={1} />);
        expect(screen.getByTestId('mock-text-output')).toHaveTextContent('Second Message');
    });

    it('hides text output when state is loading', () => {
        render(<Output {...defaultProps} councilState="loading" />);
        // In 'loading', state logic sets text to null, AND style to hidden.
        const textOutput = screen.getByTestId('mock-text-output');
        expect(textOutput).toBeInTheDocument();
        expect(textOutput.style.visibility).toBe('hidden');
        expect(textOutput).toHaveTextContent('No Text');
    });

    it('shows text output when state is playing or waiting', () => {
        // Playing
        const { rerender } = render(<Output {...defaultProps} councilState="playing" />);
        const textOutput = screen.getByTestId('mock-text-output');
        expect(textOutput.style.visibility).not.toBe('hidden');
        expect(textOutput).toHaveTextContent('Hello World');

        // Waiting (Fix Verification)
        rerender(<Output {...defaultProps} councilState="waiting" />);
        expect(textOutput.style.visibility).not.toBe('hidden');
        expect(textOutput).toHaveTextContent('Hello World');
    });

    it('hides text output when state is summary', () => {
        // In summary, text is cleared from Output (handled by overlay) and hidden
        const summaryMessage: ConversationMessage = { id: 's1', text: 'Summary Text', type: 'summary', speaker: 'System' };
        const summaryProps = {
            ...defaultProps,
            textMessages: [summaryMessage],
            playingNowIndex: 0,
            councilState: 'summary',
        };

        render(<Output {...summaryProps} />);
        const textOutput = screen.getByTestId('mock-text-output');
        expect(textOutput.style.visibility).toBe('hidden');
        expect(textOutput).toHaveTextContent('No Text');
    });
});
