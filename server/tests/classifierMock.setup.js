import { vi } from 'vitest';
import { TEST_MODES } from '@interfaces/TestModes.js';

vi.mock('@logic/SpeakerClassifierBase.js', async (importOriginal) => {
    const actual = await importOriginal();
    const mode = process.env.TEST_MODE || TEST_MODES.MOCK;

    if (mode === TEST_MODES.FAST || mode === TEST_MODES.FULL) {
        return actual;
    }

    return {
        ...actual,
        requestSpeakerClassifierCompletion: vi.fn().mockResolvedValue('anyone'),
    };
});
