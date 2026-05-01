import { describe, expect, it } from 'vitest';
import { buildEstimatedSentenceTimings } from '@root/src/logic/audio/EstimatedSubtitles.js';
import type { Message } from '@root/src/logic/audio/AudioTypes.js';

function makeMessage(text: string, sentences: string[] = []): Message {
    return {
        id: 'msg-1',
        text,
        sentences,
    };
}

describe('EstimatedSubtitles', () => {
    it('returns an empty list when duration is invalid', () => {
        expect(buildEstimatedSentenceTimings(makeMessage('One. Two.', ['One.', 'Two.']), 0)).toEqual([]);
    });

    it('fills the whole clip for a single sentence', () => {
        const subtitles = buildEstimatedSentenceTimings(makeMessage('Only.', ['Only.']), 3.5);

        expect(subtitles).toHaveLength(1);
        expect(subtitles[0]).toEqual({
            text: 'Only.',
            start: 0,
            end: 3.5,
        });
    });

    it('weights longer sentences with more time', () => {
        const subtitles = buildEstimatedSentenceTimings(
            makeMessage('Short. ' + 'Long'.repeat(8) + '.', ['Short.', 'LongLongLongLongLongLongLongLong.']),
            100
        );

        expect(subtitles).toHaveLength(2);
        const firstDuration = subtitles[0]!.end - subtitles[0]!.start;
        const secondDuration = subtitles[1]!.end - subtitles[1]!.start;
        const totalDuration = subtitles.reduce((sum, subtitle) => sum + (subtitle.end - subtitle.start), 0);

        expect(secondDuration).toBeGreaterThan(firstDuration);
        expect(totalDuration).toBeCloseTo(100, 6);
    });

    it('enforces the default 800ms minimum when the clip allows it', () => {
        const subtitles = buildEstimatedSentenceTimings(
            makeMessage('Hi. ' + 'X'.repeat(60) + '.', ['Hi.', `${'X'.repeat(60)}.`]),
            10
        );

        expect(subtitles).toHaveLength(2);
        const shortDuration = subtitles[0]!.end - subtitles[0]!.start;
        const totalDuration = subtitles.reduce((sum, subtitle) => sum + (subtitle.end - subtitle.start), 0);

        expect(shortDuration).toBeGreaterThanOrEqual(0.8 - 1e-9);
        expect(totalDuration).toBeCloseTo(10, 6);
    });

    it('falls back to an equal split when the minimum cannot fit every sentence', () => {
        const subtitles = buildEstimatedSentenceTimings(
            makeMessage('One. Two. Three. Four.', ['One.', 'Two.', 'Three.', 'Four.']),
            3
        );

        expect(subtitles).toHaveLength(4);

        for (const subtitle of subtitles) {
            expect(subtitle.end - subtitle.start).toBeCloseTo(0.75, 9);
        }

        expect(subtitles[0]!.start).toBe(0);
        expect(subtitles[3]!.end).toBeCloseTo(3, 9);
    });

    it('splits sentences from message text when sentence array is empty', () => {
        const subtitles = buildEstimatedSentenceTimings(makeMessage('One. Two?', []), 4);

        expect(subtitles).toHaveLength(2);
        expect(subtitles[0]!.text).toBe('One.');
        expect(subtitles[1]!.text).toBe('Two?');
        expect(subtitles[0]!.start).toBe(0);
        expect(subtitles[1]!.end).toBeCloseTo(4, 9);
    });
});
