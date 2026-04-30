import { describe, it, expect } from 'vitest';
import characterSetupEn from '@shared/prompts/foods_en.json';

describe('Food Image Integrity', () => {
    it('has a matching image asset for every food item', () => {
        // Import all webp images in the app's shared character asset folder.
        const imageFiles = import.meta.glob('/src/assets/characters/small/*.webp');

        // Helper to check if image exists
        const hasImage = (id: string) => {
            // Check for keys ending with the filename
            const filename = `/${id}.webp`;
            return Object.keys(imageFiles).some((key: string) => key.endsWith(filename));
        };

        // Check all characters from JSON
        characterSetupEn.characters.forEach((character: { id: string }) => {
            expect(hasImage(character.id), `Missing image for character: ${character.id}`).toBe(true);
        });

        // Check special UI images
        expect(hasImage('panelist'), 'Missing image for panelist').toBe(true);
        expect(hasImage('add'), 'Missing image for add button').toBe(true);
    });
});
