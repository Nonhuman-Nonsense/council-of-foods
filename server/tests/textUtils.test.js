import { describe, it, expect } from 'vitest';
import { splitSentences, mapSentencesToWords } from '../src/utils/textUtils.js';

describe('textUtils', () => {
    describe('splitSentences', () => {
        it('should split basic sentences based on punctuation', () => {
            const input = "Hello world. How are you? I am fine!";
            const expected = ["Hello world.", "How are you?", "I am fine!"];
            expect(splitSentences(input)).toEqual(expected);
        });

        it('should handle numbered lists', () => {
            const input = "1. First item.\n2. Second item.\n3. Third item.";
            const expected = ["1. First item.", "2. Second item.", "3. Third item."];
            expect(splitSentences(input)).toEqual(expected);
        });

        it('should handle quotes', () => {
            const input = 'He said "Hello". Then he left.';
            const expected = ['He said "Hello".', 'Then he left.'];
            expect(splitSentences(input)).toEqual(expected);
        });

        it('should handle emojis as punctuation or end of sentence', () => {
            const input = "This is fun! 🚀 Next sentence.";
            const expected = ["This is fun! 🚀", "Next sentence."];
            expect(splitSentences(input)).toEqual(expected);
        });

        it('should return empty array for empty input', () => {
            expect(splitSentences("")).toEqual([]);
            expect(splitSentences(null)).toEqual([]);
        });

        it('should split on colons unless followed by non-breaking space', () => {
            // 1. Standard colon -> Splits
            const inputStandard = "Water: Hello there.";
            const expectedStandard = ["Water:", "Hello there."];
            expect(splitSentences(inputStandard)).toEqual(expectedStandard);

            // 2. Non-breaking space prevents split
            const inputNbsp = "Water said:\u00A0Hello there.";
            const expectedNbsp = ["Water said:\u00A0Hello there."];
            expect(splitSentences(inputNbsp)).toEqual(expectedNbsp);
        });
    });

    describe('mapSentencesToWords', () => {
        it('should map sentences to word timings correctly (Exact Match)', () => {
            const sentences = ["Hello world.", "Good bye."];
            const words = [
                { word: "Hello", start: 0, end: 0.5 },
                { word: "world", start: 0.5, end: 1.0 },
                { word: "Good", start: 1.0, end: 1.5 },
                { word: "bye", start: 1.5, end: 2.0 }
            ];

            const result = mapSentencesToWords(sentences, words);
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({ text: "Hello world.", start: 0, end: 1.0 });
            expect(result[1]).toEqual({ text: "Good bye.", start: 1.0, end: 2.0 });
        });

        it('should handle punctuation differences (Fuzzy Match)', () => {
            const sentences = ["Hello, world!"];
            const words = [
                { word: "Hello", start: 0, end: 0.5 },
                { word: "world", start: 0.5, end: 1.0 }
            ];
            // Whisper often produces clean words without punctuation
            const result = mapSentencesToWords(sentences, words);
            expect(result[0]).toEqual({ text: "Hello, world!", start: 0, end: 1.0 });
        });

        it('should handle skipped words in audio (interpolation)', () => {
            const sentences = ["This is a test."];
            const words = [
                { word: "This", start: 0, end: 0.2 },
                // "is" skipped
                // "a" skipped
                { word: "test", start: 0.8, end: 1.0 }
            ];
            const result = mapSentencesToWords(sentences, words);
            expect(result[0]).toEqual({ text: "This is a test.", start: 0, end: 1.0 });
        });

        it('should handle empty words array', () => {
            expect(mapSentencesToWords(["Hello"], [])).toEqual([]);
        });

        it('should return 0 duration for emoji-only sentences', () => {
            const sentences = ["👋"];
            const words = [
                { word: "Hello", start: 0, end: 1.0 }
            ];
            // Since "👋" has no tokens, it should match nothing and get 0 duration based on last end time
            const result = mapSentencesToWords(sentences, words);
            expect(result[0].start).toBe(0);
            expect(result[0].end).toBe(0);
        });
    });
});
