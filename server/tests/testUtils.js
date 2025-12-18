import { vi } from 'vitest';
import { getGlobalOptions } from '@logic/GlobalOptions.js';


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
    let options = getGlobalOptions(); // Start with correctly merged options

    if (mode === TEST_MODES.FAST) {
        console.log('[Test] Running in FAST mode (gpt-4o-mini, no audio)');
        options.skipAudio = true;
    } else if (mode === TEST_MODES.FULL) {
        console.log('[Test] Running in FULL mode (Production models)');
        // In FULL mode, we want to test the actual production constants/models, 
        // so we ignore the test-options.json overrides.
        // This is now handled internally by getGlobalOptions checking TEST_MODE='full'.
        options = getGlobalOptions();
    } else {
        // MOCK mode
        // Uses default merged options (test-options.json)
    }

    return options;
};

