import { GlobalOptionsSchema } from "@logic/GlobalOptions.js";
import { z } from "zod";
import { type Character, AVAILABLE_VOICES, AVAILABLE_VOICES_GEMINI } from "@shared/ModelTypes.js";
import type {
    InjectionMessage,
    HandRaisedOptions,
    ReconnectionOptions,
    ReportMaximumPlayedIndexPayload,
    WrapUpMessage,
    SetupOptions,
    CreateMeetingBody,
    SubmitHumanMessagePayload,
    SubmitHumanPanelistPayload
} from "@shared/SocketTypes.js";

// --- Socket Payload Schemas ---

// Shared Sub-schemas
const MAX_HUMAN_INPUT_LENGTH = 10000;
const VoiceOptionSchema = z.enum(AVAILABLE_VOICES);
const VoiceOptionGeminiSchema = z.enum(AVAILABLE_VOICES_GEMINI);

const CharacterSchema: z.ZodType<Character> = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string(),
    prompt: z.string(),
    voice: z.string(),
    voiceProvider: z.enum(['openai', 'gemini', 'inworld', 'elevenlabs']).optional().default('openai'),
    voiceLocale: z.string().optional(),
    voiceInstruction: z.string().optional(),
    voiceTemperature: z.number().min(0.1).max(2.0).optional(),
    voiceSpeed: z.number().min(0.8).max(1.5).optional(),
    size: z.number().optional(),
}).superRefine((data, ctx) => {
    if (!data.voiceProvider || data.voiceProvider === 'openai') {
        if (!VoiceOptionSchema.safeParse(data.voice).success) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                params: { options: [...AVAILABLE_VOICES] },
                path: ['voice'],
                message: "Invalid OpenAI Voice"
            });
        }
    } else if (data.voiceProvider === 'gemini') {
        if (!VoiceOptionGeminiSchema.safeParse(data.voice).success) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                params: { options: [...AVAILABLE_VOICES_GEMINI] },
                path: ['voice'],
                message: "Invalid Gemini Voice"
            });
        }
    }
    // Inworld allows custom IDs, so no validation against the preset enum is performed.
});

// Create new meeting via API
export const CreateMeetingSchema: z.ZodType<CreateMeetingBody> = z.object({
    topic: z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        prompt: z.string()
    }),
    characters: z.array(CharacterSchema),
    language: z.string().min(2).max(2),
    humanName: z.string().min(1).optional(),
});

// 1. start_conversation — serverOptions is only applied when socket environment is prototype (see SocketManager / MeetingLifecycleHandler)
export const SetupOptionsSchema: z.ZodType<SetupOptions> = z.object({
    meetingId: z.number(),
    liveKey: z.string(),
    serverOptions: GlobalOptionsSchema.partial().optional(),
}).transform((data) => {
    if (!['test', 'prototype'].includes(process.env.NODE_ENV || '')) {
        delete data.serverOptions;
    }
    return data;
});

// 2. submit_human_message
export const SubmitHumanMessageSchema: z.ZodType<SubmitHumanMessagePayload> = z.object({
    text: z.string().min(1).max(MAX_HUMAN_INPUT_LENGTH),
});

// 2b. submit_human_panelist
export const SubmitHumanPanelistSchema: z.ZodType<SubmitHumanPanelistPayload> = z.object({
    text: z.string().min(1).max(MAX_HUMAN_INPUT_LENGTH),
    speaker: z.string().min(1),
});

// 3. raise_hand
export const HandRaisedOptionsSchema: z.ZodType<HandRaisedOptions> = z.object({
    index: z.number().int(),
    humanName: z.string().min(1),
});

// 4. attempt_reconnection
export const ReconnectionOptionsSchema: z.ZodType<ReconnectionOptions> = z.object({
    meetingId: z.number(),
    liveKey: z.string().min(1),
    handRaised: z.boolean().optional(),
    conversationMaxLength: z.number().optional(),
});

// 4b. report_maximum_played_index (live session playback progress)
export const ReportMaximumPlayedIndexSchema: z.ZodType<ReportMaximumPlayedIndexPayload> = z.object({
    index: z.number().int(),
});

// 5. submit_injection
export const InjectionMessageSchema: z.ZodType<InjectionMessage> = z.object({
    text: z.string(),
    date: z.string(),
    index: z.number(),
    length: z.number(),
});

// 6. wrap_up_meeting
export const WrapUpMessageSchema: z.ZodType<WrapUpMessage> = z.object({
    date: z.string(),
});
