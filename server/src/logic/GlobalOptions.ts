import { config } from '@root/src/config.js';
import globalOptions from '@root/global-options.json' with { type: 'json' };
import testOptions from '@root/test-options.json' with { type: 'json' };
import { CHAIR_ID, validateChairRealtimeConfig, validateHumanInputRealtimeConfig } from './characterSetupBundle.js';

import { z } from "zod";

export { CHAIR_ID } from './characterSetupBundle.js';
export const ConversationReasoningSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]);
export const SubtitleTimingTypeSchema = z.enum(["inworld", "elevenlabs", "estimated", "whisper"]);

export const ChairVoiceProfileSchema = z.object({
    voice: z.string(),
    voiceProvider: z.enum(["openai", "gemini", "inworld", "elevenlabs"]),
    voiceLocale: z.string().optional(),
    voiceInstruction: z.string().optional(),
    voiceTemperature: z.number().optional(),
    voiceStability: z.number().optional(),
    voiceStyle: z.number().optional(),
    voiceSpeed: z.number().optional(),
});

export const ChairRealtimeLanguageConfigSchema = z.object({
    provider: z.enum(["inworld", "openai"]),
    llmModel: z.string(),
    ttsModel: z.string().optional(),
    transcriptionModel: z.string(),
    agentVoice: ChairVoiceProfileSchema.nullable().optional(),
});

export const ChairRealtimeSchema = z.object({
    strategy: z.enum(["unified", "split"]),
    languages: z.record(z.string(), ChairRealtimeLanguageConfigSchema),
});

export const HumanInputRealtimeLanguageConfigSchema = z.object({
    provider: z.enum(["inworld", "openai"]),
    llmModel: z.string().optional(),
    transcriptionModel: z.string().optional(),
});

export const HumanInputRealtimeSchema = z.object({
    languages: z.record(z.string(), HumanInputRealtimeLanguageConfigSchema),
});

export const GlobalOptionsSchema = z.object({
    conversationModel: z.string(),
    conversationReasoning: ConversationReasoningSchema,
    voiceModel: z.string(),
    geminiVoiceModel: z.string(),
    inworldVoiceModel: z.string(),
    elevenlabsVoiceModel: z.string(),
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
    panelistInvitationPrompt: z.record(z.string(), z.string()),
    panelistInvitationLength: z.number(),
    finalizeMeetingPrompt: z.record(z.string(), z.string()),
    finalizeMeetingLength: z.number(),
    transcribeModel: z.string(),
    transcribePrompt: z.record(z.string(), z.string()),
    audioConcurrency: z.number(),
    voiceGuideRealtimeModel: z.string(),
    voiceGuideOpenAIRealtimeModel: z.string(),
    voiceGuideRealtimeTranscriptionModel: z.string(),
    chairRealtime: ChairRealtimeSchema,
    humanInputRealtime: HumanInputRealtimeSchema,
    speakerClassifierModel: z.string(),
    directedSpeakerRouting: z.boolean()
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

    const parsed = GlobalOptionsSchema.parse(options) as GlobalOptions;
    validateChairRealtimeConfig(parsed);
    validateHumanInputRealtimeConfig(parsed);
    return parsed;
};
