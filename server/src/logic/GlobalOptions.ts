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
    voiceProvider: z.enum(["openai", "inworld", "elevenlabs"]),
    voiceLocale: z.string().optional(),
    voiceInstruction: z.string().optional(),
    voiceTemperature: z.number().optional(),
    voiceStability: z.number().optional(),
    voiceStyle: z.number().optional(),
    voiceSpeed: z.number().optional(),
});

export const ChairRealtimeLanguageConfigSchema = z.object({
    provider: z.enum(["inworld"]),
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
    provider: z.enum(["inworld"]),
    llmModel: z.string(),
    transcriptionModel: z.string(),
});

export const HumanInputRealtimeSchema = z.object({
    languages: z.record(z.string(), HumanInputRealtimeLanguageConfigSchema),
});

export const VoiceLoudnessSchema = z.object({
    targetLufs: z.number(),
    skipBelowDb: z.number().nonnegative(),
    truePeakDb: z.number().max(0),
});

export const GlobalOptionsSchema = z.object({
    conversationModel: z.string(),
    conversationReasoning: ConversationReasoningSchema,
    voiceModel: z.string(),
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
    concludeMeetingPrompt: z.record(z.string(), z.string()),
    concludeMeetingLength: z.number(),
    summarizeMeetingPrompt: z.record(z.string(), z.string()),
    summarizeMeetingLength: z.number(),
    transcribeModel: z.string(),
    transcribePrompt: z.record(z.string(), z.string()),
    audioConcurrency: z.number(),
    /**
     * Every newly generated message is brought to one perceived loudness, so no being speaks
     * louder than another. null switches it off. See `normalizeLoudness` in AudioUtils.
     */
    voiceLoudness: VoiceLoudnessSchema.nullable(),
    chairRealtime: ChairRealtimeSchema,
    humanInputRealtime: HumanInputRealtimeSchema,
    speakerClassifierModel: z.string(),
    directedSpeakerRouting: z.boolean(),
    autoplayEarliestMeetingDate: z.string(),
    /**
     * How a meeting ends: a protocol read by the chair, or a letter one of the beings sends.
     * See docs/council-letters.md.
     */
    meetingEnding: z.enum(["protocol", "letter"]),
    /** Public site the letter footer links a meeting from: `<site>/<lang>/meeting/<id>`. */
    letterSiteUrl: z.string(),
    /** Most recipients offered to the author at once, mixed across categories (see candidateRecipients). */
    letterMaxCandidates: z.number().int().positive(),
    /**
     * The model the author plans and writes the letter with — a letter goes to a real person, so
     * it can be a stronger model than the council speaks with. Through the same router.
     */
    letterModel: z.string(),
    letterReasoning: ConversationReasoningSchema,
    /**
     * Folds the human's addition into the drafted letter once they have spoken — the only letter
     * step the human waits for, so a fast model; it only rewrites, with the meeting left out.
     */
    letterWeaveModel: z.string(),
    letterWeaveReasoning: ConversationReasoningSchema,
    /** Token budgets for the plan and the letter, including any thinking. Prompts are in logic/letters/prompts. */
    letterPlanLength: z.number(),
    letterWriteLength: z.number(),
    /** An author sits out this many letters after writing one, so the letters come from many voices. */
    letterAuthorCooldown: z.number().int().nonnegative(),
    /** Letters go out from `<being>@<letterSenderDomain>`, authenticated in Brevo. */
    letterSenderDomain: z.string(),
    /**
     * Replies come back to `<being>.<meetingId>@<letterReplyDomain>`, a different domain
     * delegated to Brevo's inbound parsing (Brevo will not receive on the sending domain).
     */
    letterReplyDomain: z.string(),
    /** A being's address where it is not simply its id, e.g. `{ "treeharvester": "tree.harvester" }`. */
    letterSenderAddresses: z.record(z.string(), z.string()),
    /**
     * Most letters sent in any 24 hours — a ceiling for a bug, not a pace: far above the
     * expected handful a day. Reaching it holds the rest in the outbox and alerts.
     */
    letterDailyLimit: z.number().int().positive(),
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
