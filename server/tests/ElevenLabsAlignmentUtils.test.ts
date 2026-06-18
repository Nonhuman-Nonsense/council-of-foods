import { describe, it, expect } from 'vitest';
import { characterAlignmentToWords } from '../src/utils/ElevenLabsAlignmentUtils.js';

describe('ElevenLabsAlignmentUtils', () => {
    it('groups character timings into spoken words', () => {
        const words = characterAlignmentToWords({
            characters: ['H', 'e', 'l', 'l', 'o', ' ', 'w', 'o', 'r', 'l', 'd', '!'],
            character_start_times_seconds: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55],
            character_end_times_seconds: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6],
        });

        expect(words).toEqual([
            { word: 'Hello', start: 0, end: 0.25 },
            { word: 'world', start: 0.3, end: 0.55 },
        ]);
    });

    it('returns an empty list when alignment has no spoken characters', () => {
        expect(characterAlignmentToWords({
            characters: [' ', '!', '?'],
            character_start_times_seconds: [0, 0.1, 0.2],
            character_end_times_seconds: [0.1, 0.2, 0.3],
        })).toEqual([]);
    });
});
