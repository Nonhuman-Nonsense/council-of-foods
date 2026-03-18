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
} as const;