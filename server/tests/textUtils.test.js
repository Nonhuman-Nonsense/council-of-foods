import { describe, it, expect } from 'vitest';
import { splitSentences, mapSentencesToWords } from '@shared/textUtils.js';

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

        it('should ignore provider punctuation tokens when mapping sentences', () => {
            const sentences = ["Hello, world!", "Good bye."];
            const words = [
                { word: "", start: 0, end: 0.01 },
                { word: "Hello", start: 0.01, end: 0.4 },
                { word: ", ", start: 0.4, end: 0.45 },
                { word: "world", start: 0.45, end: 1.0 },
                { word: "! ", start: 1.0, end: 1.1 },
                { word: "Good", start: 1.1, end: 1.5 },
                { word: " ", start: 1.5, end: 1.5 },
                { word: "bye", start: 1.5, end: 2.0 },
                { word: ".", start: 2.0, end: 2.05 },
            ];

            const result = mapSentencesToWords(sentences, words);

            expect(result).toEqual([
                { text: "Hello, world!", start: 0.01, end: 1.0 },
                { text: "Good bye.", start: 1.1, end: 2.0 },
            ]);
        });

        it('should prefer the repeated-word position with the best following token match', () => {
            const sentences = ["The apple is red.", "The banana is yellow."];
            const words = [
                { word: "The", start: 0, end: 0.2 },
                { word: "apple", start: 0.2, end: 0.7 },
                { word: "is", start: 0.7, end: 0.9 },
                { word: "red", start: 0.9, end: 1.2 },
                { word: "The", start: 1.6, end: 1.8 },
                { word: "banana", start: 1.8, end: 2.3 },
                { word: "is", start: 2.3, end: 2.5 },
                { word: "yellow", start: 2.5, end: 3.0 },
            ];

            const result = mapSentencesToWords(sentences, words);

            expect(result[0]).toEqual({ text: "The apple is red.", start: 0, end: 1.2 });
            expect(result[1]).toEqual({ text: "The banana is yellow.", start: 1.6, end: 3.0 });
        });

        it('should align long sentences when some spoken words are missing', () => {
            const sentences = ["The council of foods gathers around the table to discuss justice."];
            const words = [
                { word: "The", start: 0, end: 0.2 },
                { word: "council", start: 0.2, end: 0.7 },
                { word: "foods", start: 1.0, end: 1.4 },
                { word: "gathers", start: 1.5, end: 2.0 },
                { word: "around", start: 2.1, end: 2.5 },
                { word: "table", start: 3.0, end: 3.4 },
                { word: "discuss", start: 3.8, end: 4.2 },
                { word: "justice", start: 4.3, end: 4.8 },
            ];

            const result = mapSentencesToWords(sentences, words);

            expect(result[0]).toEqual({
                text: "The council of foods gathers around the table to discuss justice.",
                start: 0,
                end: 4.8
            });
        });
    });
});
