import { describe, expect, it } from 'vitest';
import { buildEstimatedSentenceTimings } from '@root/src/logic/audio/EstimatedSubtitles.js';
import { validateSentenceTimingsAgainstDuration } from '@root/src/logic/audio/SubtitleTimingValidation.js';
import { mapSentencesToWords, type Word } from '@shared/textUtils.js';
import type { Message } from '@root/src/logic/audio/AudioTypes.js';

function message(text: string, sentences: string[]): Message {
    return { id: 'msg-validation', text, sentences };
}

describe('SubtitleTimingValidation', () => {
    it('accepts timings that cover the audio duration', () => {
        const result = validateSentenceTimingsAgainstDuration(
            [
                { text: 'One.', start: 0, end: 1.2 },
                { text: 'Two.', start: 1.4, end: 3.9 },
            ],
            4
        );

        expect(result.valid).toBe(true);
    });

    it('rejects compressed timings that end far before the audio duration', () => {
        const result = validateSentenceTimingsAgainstDuration(
            [
                { text: 'One.', start: 0, end: 1.2 },
                { text: 'Two.', start: 1.4, end: 3.9 },
            ],
            20
        );

        expect(result).toEqual({
            valid: false,
            reason: 'last subtitle ends 16.1s before audio ends'
        });
    });

    it('accepts short clips with trailing nonverbal audio', () => {
        const result = validateSentenceTimingsAgainstDuration(
            [
                { text: 'K-CHHHHK...', start: 0, end: 0.56 },
                { text: 'stone heart no chest body save destroy path greed', start: 0.9, end: 5.4 },
                { text: 'SKREEEEE...', start: 5.82, end: 6.36 },
            ],
            8.45
        );

        expect(result.valid).toBe(true);
    });

    it('rejects trailing gaps that are larger than expected nonverbal audio', () => {
        const result = validateSentenceTimingsAgainstDuration(
            [
                { text: 'One.', start: 0, end: 1 },
                { text: 'Two.', start: 1.2, end: 3 },
            ],
            8.25
        );

        expect(result).toEqual({
            valid: false,
            reason: 'last subtitle ends 5.25s before audio ends'
        });
    });

    it('honors a custom allowed end gap', () => {
        const sentences = [
            { text: 'One.', start: 0, end: 1 },
            { text: 'Two.', start: 1.2, end: 3 },
        ];

        expect(validateSentenceTimingsAgainstDuration(sentences, 12, 10).valid).toBe(true);
        expect(validateSentenceTimingsAgainstDuration(sentences, 12, 2).valid).toBe(false);
    });

    it('rejects timings that move backwards', () => {
        const result = validateSentenceTimingsAgainstDuration(
            [
                { text: 'One.', start: 0, end: 2 },
                { text: 'Two.', start: 1, end: 1.5 },
            ],
            2
        );

        expect(result.valid).toBe(false);
        expect(result.reason).toContain('moves backwards');
    });

    it('keeps estimated and word-mapped timings within the same duration envelope', () => {
        const sentences = [
            'The first sentence has several spoken words.',
            'The second sentence finishes the clip.'
        ];
        const words: Word[] = [
            { word: 'The', start: 0, end: 0.2 },
            { word: 'first', start: 0.25, end: 0.6 },
            { word: 'sentence', start: 0.65, end: 1.1 },
            { word: 'has', start: 1.15, end: 1.3 },
            { word: 'several', start: 1.35, end: 1.8 },
            { word: 'spoken', start: 1.85, end: 2.2 },
            { word: 'words', start: 2.25, end: 2.6 },
            { word: 'The', start: 3, end: 3.2 },
            { word: 'second', start: 3.25, end: 3.7 },
            { word: 'sentence', start: 3.75, end: 4.2 },
            { word: 'finishes', start: 4.25, end: 4.8 },
            { word: 'the', start: 4.85, end: 5 },
            { word: 'clip', start: 5.05, end: 5.6 },
        ];

        const wordMapped = mapSentencesToWords(sentences, words);
        const estimated = buildEstimatedSentenceTimings(message(sentences.join(' '), sentences), 5.7);

        expect(validateSentenceTimingsAgainstDuration(wordMapped, 5.7).valid).toBe(true);
        expect(validateSentenceTimingsAgainstDuration(estimated, 5.7).valid).toBe(true);
        expect(Math.abs(wordMapped.at(-1)!.end - estimated.at(-1)!.end)).toBeLessThan(0.2);
    });
});
