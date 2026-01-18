import { GlobalOptionsSchema } from "@logic/GlobalOptions.js";
import { z } from "zod";
import { type Character, AVAILABLE_VOICES, AVAILABLE_VOICES_GEMINI, AVAILABLE_VOICES_INWORLD } from "@shared/ModelTypes.js";
import type {
    HumanMessage,
    InjectionMessage,
    HandRaisedOptions,
    ReconnectionOptions,
    WrapUpMessage,
    SetupOptions
} from "@shared/SocketTypes.js";

// --- Socket Payload Schemas ---

// Shared Sub-schemas
const VoiceOptionSchema = z.enum(AVAILABLE_VOICES);
const VoiceOptionGeminiSchema = z.enum(AVAILABLE_VOICES_GEMINI);
const VoiceOptionInworldSchema = z.enum(AVAILABLE_VOICES_INWORLD);

const CharacterSchema: z.ZodType<Character> = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.string().optional(),
    voice: z.string(),
    voiceProvider: z.enum(['openai', 'gemini', 'inworld']).optional().default('openai'),
    voiceLocale: z.string().optional(),
    prompt: z.string().optional(),
    voiceInstruction: z.string().optional(),
    voiceTemperature: z.number().min(0.1).max(2.0).optional(),
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



// 1. start_conversation
export const SetupOptionsSchema: z.ZodType<SetupOptions> = z.object({
    options: GlobalOptionsSchema.partial().optional(),
    characters: z.array(CharacterSchema),
    language: z.string().default('en'),
    topic: z.string(),
}).transform((data) => {
    if (!['test', 'prototype'].includes(process.env.NODE_ENV || '')) {
        delete data.options;
    }
    return data;
});

// 2. submit_human_message & submit_human_panelist
export const HumanMessageSchema: z.ZodType<HumanMessage> = z.object({
    text: z.string().min(1),
    askParticular: z.string().optional(),
    speaker: z.string().optional(),
    id: z.string().optional(),
    type: z.string().optional(),
    sentences: z.array(z.string()).optional(),
});

// 3. raise_hand
export const HandRaisedOptionsSchema: z.ZodType<HandRaisedOptions> = z.object({
    index: z.number().int(),
    humanName: z.string().min(1),
});

// 4. attempt_reconnection
export const ReconnectionOptionsSchema: z.ZodType<ReconnectionOptions> = z.object({
    meetingId: z.union([z.string(), z.number()]),
    handRaised: z.boolean().optional(),
    conversationMaxLength: z.number().optional(),
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
