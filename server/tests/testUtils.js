import { vi } from 'vitest';
import testOptions from '../test-options.json';
import { getGlobalOptions } from '../src/logic/GlobalOptions.js';


/**
 * Defines the available testing modes for the application.
 * - MOCK: Basic unit tests with simulated services (Fastest, No Cost).
 * - FAST: Integration tests with Real OpenAI API but Skipped Audio (Fast, Low Cost).
 * - FULL: Full system tests with Real OpenAI API and Audio Generation (Slow, Higher Cost).
 */
export const TEST_MODES = {
    MOCK: 'mock',
    FAST: 'fast',
    FULL: 'full',
};

/**
 * Retrieves the current test mode from environment variable TEST_MODE.
 * Defaults to MOCK.
 */
export const getTestMode = () => process.env.TEST_MODE || TEST_MODES.MOCK;

/**
 * Configures global options based on the active test mode.
 * - FAST mode: Sets skipAudio=true (unless overriding) and uses gpt-4o-mini.
 * - FULL mode: Loads production-like settings from GlobalOptions.js.
 * @returns {object} The configured options object.
 */
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
