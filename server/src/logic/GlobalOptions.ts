import { config } from '@root/src/config.js';
import globalOptions from '@root/global-options.json' with { type: 'json' };
import testOptions from '@root/test-options.json' with { type: 'json' };

export interface GlobalOptions {
    gptModel: string;
    voiceModel: string;
    temperature: number;
    maxTokens: number;
    chairMaxTokens: number;
    frequencyPenalty: number;
    presencePenalty: number;
    audio_speed: number;
    trimSentance: boolean;
    trimParagraph: boolean;
    chairId: string;
    trimChairSemicolon: boolean;
    show_trimmed: boolean;
    skipAudio: boolean;
    conversationMaxLength: number;
    raiseHandPrompt: Record<string, string>;
    raiseHandInvitationLength: number;
    finalizeMeetingPrompt: Record<string, string>;
    finalizeMeetingLength: number;
    extraMessageCount: number;
    transcribeModel: string;
    transcribePrompt: Record<string, string>;
    audioConcurrency: number;
}

export const getGlobalOptions = (): GlobalOptions => {
    const env = config.NODE_ENV;
    const testMode = config.TEST_MODE;
    const useTestOptions = config.USE_TEST_OPTIONS;

    // Base options
    let options = { ...globalOptions };

    // Apply overrides for Test, Development, or Prototype environments
    // OR if explicitly requested via USE_TEST_OPTIONS
    // BUT SKIP if running in FULL test mode (which targets production models)
    if (testMode !== 'full' && (env === 'test' || env === 'development' || env === 'prototype' || useTestOptions)) {
        options = { ...options, ...testOptions };
    }

    return options as GlobalOptions;
};
