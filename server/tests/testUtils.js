import { vi } from 'vitest';
import testOptions from '../test-options.json';
import { getGlobalOptions } from '../src/logic/GlobalOptions.js';

export const TEST_MODES = {
    MOCK: 'mock',
    FAST: 'fast',
    FULL: 'full',
};

export const getTestMode = () => process.env.TEST_MODE || TEST_MODES.MOCK;

export const setupTestOptions = () => {
    const mode = getTestMode();
    let options = { ...testOptions }; // Clone

    if (mode === TEST_MODES.FAST) {
        console.log('[Test] Running in FAST mode (gpt-4o-mini, no audio)');
        options.skipAudio = true; // Enable audio to verify actual API integration
    } else if (mode === TEST_MODES.FULL) {
        console.log('[Test] Running in FULL mode (Production models)');
        options = getGlobalOptions();
    } else {
        // MOCK mode
        // Options remain default, but services will be mocked
    }

    return options;
};
