import { config } from '@root/src/config.js';
import globalOptions from '@root/global-options.json' with { type: 'json' };
import testOptions from '@root/test-options.json' with { type: 'json' };

import { z } from "zod";

export const GlobalOptionsSchema = z.object({
    gptModel: z.string(),
    voiceModel: z.string(),
    geminiVoiceModel: z.string(),
    inworldVoiceModel: z.string(),
    temperature: z.number(),
    maxTokens: z.number(),
    chairMaxTokens: z.number(),
    frequencyPenalty: z.number(),
    presencePenalty: z.number(),
    audio_speed: z.number(),
    trimSentance: z.boolean(),
    trimParagraph: z.boolean(),
    chairId: z.string(),
    trimChairSemicolon: z.boolean(),
    show_trimmed: z.boolean(),
    skipAudio: z.boolean(),
    conversationMaxLength: z.number(),
    raiseHandPrompt: z.record(z.string(), z.string()),
    raiseHandInvitationLength: z.number(),
    finalizeMeetingPrompt: z.record(z.string(), z.string()),
    finalizeMeetingLength: z.number(),
    extraMessageCount: z.number(),
    transcribeModel: z.string(),
    transcribePrompt: z.record(z.string(), z.string()),
    audioConcurrency: z.number(),
});

export type GlobalOptions = z.infer<typeof GlobalOptionsSchema>;

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
