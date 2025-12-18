import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import Output from '../../../src/components/Output';
import React from 'react';
import { ConversationMessage } from '@shared/ModelTypes';
import { DecodedAudioMessage } from '@hooks/useCouncilMachine';

// Mock child components to verify props and rendering
vi.mock('../../../src/components/TextOutput', () => ({
    default: ({ currentAudioMessage, style }: any) => (
        <div data-testid="mock-text-output" style={style}>
            {/* Simulate text derived from audio message ID for verification */}
            {currentAudioMessage ? `Message ${currentAudioMessage.id}` : 'No Text'}
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
        { id: '1', audio: {} as AudioBuffer, sentences: [{ text: 'Hello World', start: 0, end: 1 }] },
        { id: '2', audio: {} as AudioBuffer, sentences: [{ text: 'Second Message', start: 0, end: 1 }] },
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
        // mockAudioMessage with index 1 has id '2'
        expect(screen.getByTestId('mock-text-output')).toHaveTextContent('Message 2');
    });

    it('hides text output when state is loading', () => {
        render(<Output {...defaultProps} councilState="loading" />);
        const textOutput = screen.getByTestId('mock-text-output');
        expect(textOutput).not.toBeVisible();
        expect(textOutput).toHaveTextContent('No Text');
    });

    it('shows text output when state is playing or waiting', () => {
        // Playing. index 0 -> id '1'
        const { rerender } = render(<Output {...defaultProps} councilState="playing" />);
        const textOutput = screen.getByTestId('mock-text-output');
        expect(textOutput).toBeVisible();
        expect(textOutput).toHaveTextContent('Message 1');

        // Waiting
        rerender(<Output {...defaultProps} councilState="waiting" />);
        expect(textOutput).toBeVisible();
        expect(textOutput).toHaveTextContent('Message 1');
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
        expect(textOutput).not.toBeVisible();
        expect(textOutput).toHaveTextContent('No Text');
    });
});
