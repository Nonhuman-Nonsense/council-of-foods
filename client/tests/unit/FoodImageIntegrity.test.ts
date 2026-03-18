import { describe, it, expect } from 'vitest';
import foodsEn from '/src/prompts/foods_en.json';

describe('Food Image Integrity', () => {
    it('has a matching image asset for every food item', () => {
        // Import all webp images in the assets folder
        const imageFiles = import.meta.glob('/src/assets/foods/small/*.webp');

        // Helper to check if image exists
        const hasImage = (id: string) => {
            // Check for keys ending with the filename
            const filename = `/${id}.webp`;
            return Object.keys(imageFiles).some(key => key.endsWith(filename));
        };

        // Check all foods from JSON
        foodsEn.foods.forEach(food => {
            expect(hasImage(food.id), `Missing image for food: ${food.id}`).toBe(true);
        });

        // Check special UI images
        expect(hasImage('panelist'), 'Missing image for panelist').toBe(true);
        expect(hasImage('add'), 'Missing image for add button').toBe(true);
    });
});
