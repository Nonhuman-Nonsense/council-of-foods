import { describe, it, expect } from 'vitest';
import foodsEn from '@shared/prompts/foods_en.json';

describe('Food Image Integrity', () => {
    it('has a matching icon asset for every food item', () => {
        const imageFiles = import.meta.glob('/src/assets/characters/icons/*.webp');

        const hasImage = (id: string) => {
            const filename = `/${id}.webp`;
            return Object.keys(imageFiles).some((key: string) => key.replace(/\\/g, '/').endsWith(filename));
        };

        foodsEn.foods.forEach((food: { id: string }) => {
            expect(hasImage(food.id), `Missing icon for food: ${food.id}`).toBe(true);
        });

        expect(hasImage('panelist'), 'Missing image for panelist').toBe(true);
        expect(hasImage('add'), 'Missing image for add button').toBe(true);
    });
});
