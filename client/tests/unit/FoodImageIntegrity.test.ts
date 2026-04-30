import { describe, it, expect } from 'vitest';
import { characterSetupEn } from '../characterSetupTestData';

describe('Food Image Integrity', () => {
    it('has a matching icon asset for every food item', () => {
        const imageFiles = import.meta.glob('/src/assets/characters/icons/*.webp');

        const hasImage = (id: string) => {
            const filename = `/${id}.webp`;
            return Object.keys(imageFiles).some((key: string) => key.replace(/\\/g, '/').endsWith(filename));
        };

        // Check all characters from JSON
        characterSetupEn.characters.forEach((character: { id: string }) => {
            expect(hasImage(character.id), `Missing image for character: ${character.id}`).toBe(true);
        });

        expect(hasImage('panelist'), 'Missing image for panelist').toBe(true);
        expect(hasImage('add'), 'Missing image for add button').toBe(true);
    });
});
