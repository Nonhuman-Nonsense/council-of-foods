import { config } from '@root/src/config.js';
import globalOptions from '@root/global-options.json' with { type: 'json' };
import testOptions from '@root/test-options.json' with { type: 'json' };
import { defaultCharacterSetupBundle } from './characterSetupBundle.js';

import { z } from "zod";

/** Same as `characters[0].id` in the default character-setup bundle (validated in prompt data tests). */
export const CHAIR_ID = defaultCharacterSetupBundle.characters[0].id;
export const ConversationReasoningSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]);
export const SubtitleTimingTypeSchema = z.enum(["inworld", "estimated", "whisper"]);

export const GlobalOptionsSchema = z.object({
    conversationModel: z.string(),
    conversationReasoning: ConversationReasoningSchema,
    voiceModel: z.string(),
    geminiVoiceModel: z.string(),
    inworldVoiceModel: z.string(),
    temperature: z.number(),
    maxTokens: z.number(),
    chairMaxTokens: z.number(),
    defaultAudioSpeed: z.number(),
    subtitleTimingPriorities: z.array(SubtitleTimingTypeSchema).nonempty(),
    trimSentance: z.boolean(),
    trimParagraph: z.boolean(),
    chairId: z.string(),
    trimChairSemicolon: z.boolean(),
    show_trimmed: z.boolean(),
    skipAudio: z.boolean(),
    conversationMaxLength: z.number(),
    extraMessageCount: z.number(),
    meetingVeryMaxLength: z.number(),
    raiseHandPrompt: z.record(z.string(), z.string()),
    raiseHandInvitationLength: z.number(),
    finalizeMeetingPrompt: z.record(z.string(), z.string()),
    finalizeMeetingLength: z.number(),
    transcribeModel: z.string(),
    transcribePrompt: z.record(z.string(), z.string()),
    audioConcurrency: z.number(),
    voiceGuideRealtimeModel: z.string(),
    voiceGuideOpenAIRealtimeModel: z.string(),
    voiceGuideRealtimeTranscriptionModel: z.string(),
    humanTargetingModel: z.string()
});

export type GlobalOptions = z.infer<typeof GlobalOptionsSchema>;

export const getGlobalOptions = (): GlobalOptions => {
    const env = config.NODE_ENV;
    const testMode = config.TEST_MODE;
    const useTestOptions = config.USE_TEST_OPTIONS;

    // Base options (chairId comes from prompts, not global-options.json)
    let options = { ...globalOptions, chairId: CHAIR_ID };

    // Apply overrides for Test, Development, or Prototype environments
    // OR if explicitly requested via USE_TEST_OPTIONS
    // BUT SKIP if running in FULL test mode (which targets production models)
    if (testMode !== 'full' && (env === 'test' || env === 'development' || env === 'prototype' || useTestOptions)) {
        options = { ...options, ...testOptions };
    }

    return options as GlobalOptions;
};
