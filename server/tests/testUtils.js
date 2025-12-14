import { vi } from 'vitest';
import globalOptions from '../global-options.json';

export const TEST_MODES = {
    MOCK: 'mock',
    FAST: 'fast',
    FULL: 'full',
};

export const getTestMode = () => process.env.TEST_MODE || TEST_MODES.MOCK;

export const setupTestOptions = () => {
    const mode = getTestMode();
    const options = { ...globalOptions }; // Clone

    if (mode === TEST_MODES.FAST) {
        console.log('[Test] Running in FAST mode (gpt-4o-mini, no audio)');
        options.gptModel = 'gpt-4o-mini';
        options.transcribeModel = 'whisper-1'; // or cheaper if avail
        options.voiceModel = 'tts-1';
        options.skipAudio = true; // Speed up
        options.validate = true; // Custom flag for assertions
    } else if (mode === TEST_MODES.FULL) {
        console.log('[Test] Running in FULL mode (Production models)');
    } else {
        // MOCK mode
        // Options remain default, but services will be mocked
    }

    return options;
};
