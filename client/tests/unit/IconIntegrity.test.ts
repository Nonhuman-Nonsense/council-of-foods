import { describe, it, expect, vi } from 'vitest';

describe('Icon Integrity', () => {
    it('exports filled variants for all control icons', async () => {
        // Import the ACTUAL module, bypassing the global mock in setupTests
        const { Icons } = await vi.importActual<typeof import('../../src/assets/icons/index')>('../../src/assets/icons/index');

        const iconsRequiringHoverState = [
            'play',
            'pause',
            'forward',
            'backward',
            'volume_on',
            'volume_off',
            'raise_hand',
            'record_voice_on',
            'record_voice_off',
            'send_message'
        ];

        iconsRequiringHoverState.forEach(icon => {
            const filledIconName = `${icon}_filled`;
            expect(Icons).toHaveProperty(filledIconName);
            expect(Icons[filledIconName as keyof typeof Icons]).toBeDefined();
        });
    });
});
