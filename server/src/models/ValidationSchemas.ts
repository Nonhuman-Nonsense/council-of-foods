import { z } from "zod";

// --- Environment Variables Schema ---
export const EnvSchema = z.object({
    COUNCIL_DB_URL: z.string().url().default("mongodb://localhost:27017"),
    COUNCIL_DB_PREFIX: z.string().default("CouncilOfFoods"),
    OPENAI_API_KEY: z.string().min(1, "OpenAI API Key is required"),
    PORT: z.string().default("3001").transform((val) => parseInt(val, 10)),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    COUNCIL_ERRORBOT: z.string().optional(),
    USE_TEST_OPTIONS: z.enum(["true", "false"]).transform((val) => val === "true").optional()
});

export type EnvConfig = z.infer<typeof EnvSchema>;

// --- Socket Payload Schemas ---

// Shared Sub-schemas
const CharacterSchema = z.object({
    id: z.string(),
    name: z.string(),
    type: z.string().optional(),
    voice: z.string().optional(),
    prompt: z.string().optional(),
}).passthrough(); // Allow other properties for flexibility

const ConversationStateSchema = z.object({
    humanName: z.string().optional(),
    alreadyInvited: z.boolean().optional(),
}).passthrough();

const GlobalOptionsSchema = z.object({
    conversationMaxLength: z.number().optional(),
    // Add other known options as needed
}).passthrough();

// 1. start_conversation
export const SetupOptionsSchema = z.object({
    options: GlobalOptionsSchema.optional(),
    characters: z.array(CharacterSchema),
    language: z.string().default('en'),
    topic: z.string(),
    state: ConversationStateSchema.optional()
});

// 2. submit_human_message & submit_human_panelist
export const HumanMessageSchema = z.object({
    text: z.string(),
    askParticular: z.string().optional(),
    speaker: z.string().optional(),
    id: z.string().optional(),
    type: z.string().optional(),
    sentences: z.array(z.string()).optional(),
}).passthrough();

// 3. raise_hand
export const HandRaisedOptionsSchema = z.object({
    index: z.number(),
    humanName: z.string(),
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
