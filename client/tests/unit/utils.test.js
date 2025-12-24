import { describe, it, expect } from 'vitest';
import { capitalizeFirstLetter, toTitleCase, filename, mapFoodIndex } from '../../src/utils';

describe('Utils', () => {
    describe('capitalizeFirstLetter', () => {
        it('should capitalize the first letter of a string', () => {
            expect(capitalizeFirstLetter('hello')).toBe('Hello');
        });

        it('should return empty string if input is empty', () => {
            expect(capitalizeFirstLetter('')).toBe('');
        });

        it('should handle single character strings', () => {
            expect(capitalizeFirstLetter('a')).toBe('A');
        });

        it('should return input as is if not a string (except null/undefined becomes "")', () => {
            expect(capitalizeFirstLetter(null)).toBe('');
            expect(capitalizeFirstLetter(undefined)).toBe('');
            expect(capitalizeFirstLetter(123)).toBe(123);
        });
    });

    describe('toTitleCase', () => {
        it('should convert string to title case', () => {
            expect(toTitleCase('hello world')).toBe('Hello World');
        });

        it('should handle all uppercase input', () => {
            expect(toTitleCase('HELLO WORLD')).toBe('Hello World');
        });

        it('should handle mixed case input', () => {
            expect(toTitleCase('hElLo wOrLd')).toBe('Hello World');
        });
    });

    describe('filename', () => {
        it('should convert string to filename format', () => {
            expect(filename('Hello World')).toBe('hello_world');
        });

        it('should handle multiple spaces', () => {
            expect(filename('Hello  World')).toBe('hello__world');
        });
    });

    describe('mapFoodIndex', () => {
        // Logic: (Math.ceil(total / 2) + index - 1) % total
        // Goal: "Put chair in the middle always", but "chair" concept is abstract here.
        // It seems to be shifting the index to center the items visually.

        it('should map indices correctly for odd total', () => {
            // Total 5. Middle is ceil(2.5) = 3.
            // Index 0 -> (3 + 0 - 1) % 5 = 2
            // Index 1 -> (3 + 1 - 1) % 5 = 3
            // Index 2 -> (3 + 2 - 1) % 5 = 4
            // Index 3 -> (3 + 3 - 1) % 5 = 0
            // Index 4 -> (3 + 4 - 1) % 5 = 1
            const total = 5;
            expect(mapFoodIndex(total, 0)).toBe(2);
            expect(mapFoodIndex(total, 1)).toBe(3);
            expect(mapFoodIndex(total, 2)).toBe(4);
            expect(mapFoodIndex(total, 3)).toBe(0);
            expect(mapFoodIndex(total, 4)).toBe(1);
        });

        it('should map indices correctly for even total', () => {
            // Total 4. Middle is ceil(2) = 2.
            // Index 0 -> (2 + 0 - 1) % 4 = 1
            // Index 1 -> (2 + 1 - 1) % 4 = 2
            // Index 2 -> (2 + 2 - 1) % 4 = 3
            // Index 3 -> (2 + 3 - 1) % 4 = 0
            const total = 4;
            expect(mapFoodIndex(total, 0)).toBe(1);
            expect(mapFoodIndex(total, 1)).toBe(2);
            expect(mapFoodIndex(total, 2)).toBe(3);
            expect(mapFoodIndex(total, 3)).toBe(0);
        });
    });
});
