import { GlobalOptionsSchema } from "@logic/GlobalOptions.js";
import { z } from "zod";

// --- Socket Payload Schemas ---

// Shared Sub-schemas
const OpenAIVoiceSchema = z.enum(["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"]);

const CharacterSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.string().optional(),
    voice: OpenAIVoiceSchema,
    prompt: z.string().optional(),
});

const ConversationStateSchema = z.object({
    humanName: z.string().optional(),
    alreadyInvited: z.boolean().optional(),
});

// 1. start_conversation
export const SetupOptionsSchema = z.object({
    options: GlobalOptionsSchema.partial().optional(),
    characters: z.array(CharacterSchema),
    language: z.string().default('en'),
    topic: z.string(),
    state: ConversationStateSchema.optional()
}).transform((data) => {
    if (!['test', 'prototype'].includes(process.env.NODE_ENV || '')) {
        delete data.options;
    }
    return data;
});

// 2. submit_human_message & submit_human_panelist
export const HumanMessageSchema = z.object({
    text: z.string().min(1),
    askParticular: z.string().optional(),
    speaker: z.string().optional(),
    id: z.string().optional(),
    type: z.string().optional(),
    sentences: z.array(z.string()).optional(),
});

// 3. raise_hand
export const HandRaisedOptionsSchema = z.object({
    index: z.number().int(),
    humanName: z.string().min(1),
});

// 4. attempt_reconnection
export const ReconnectionOptionsSchema = z.object({
    meetingId: z.union([z.string(), z.number()]),
    handRaised: z.boolean().optional(),
    conversationMaxLength: z.number().optional(),
});

// 5. submit_injection
export const InjectionMessageSchema = z.object({
    text: z.string(),
    date: z.string(),
    index: z.number(),
    length: z.number(),
});

// 6. wrap_up_meeting
export const WrapUpMessageSchema = z.object({
    date: z.string(),
});
