import { z } from "zod";
import { TEST_MODES } from "@interfaces/TestModes.js";
import { VenuesEnv } from "./Venues.js";

/** `KEY=` in an .env file means "not set", not an invalid empty value. */
function unsetIfBlank<T extends z.ZodType>(schema: T) {
    return z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), schema.optional());
}

// --- Environment Variables Schema ---
export const EnvSchema = z.object({
    COUNCIL_DB_URL: z.url(),
    COUNCIL_DB_PREFIX: z.string(),
    COUNCIL_OPENAI_API_KEY: z.string().min(1),
    PORT: z.string().default("3001").transform((val) => parseInt(val, 10)),
    NODE_ENV: z.enum(["development", "production", "test", "prototype"]).default("production"),
    COUNCIL_ERRORBOT: z.string().optional(),
    COUNCIL_ERRORBOT_KEY: z.string().optional(),
    TEST_MODE: z.enum(TEST_MODES).optional(),
    USE_TEST_OPTIONS: z.enum(["true", "false"]).transform((val) => val === "true").optional(),
    INWORLD_API_KEY: z.string().min(1),
    ELEVENLABS_API_KEY: z.string().min(1).optional(),
    // Email (Brevo transactional API). Without both, nothing is emailed.
    COUNCIL_BREVO_API_KEY: unsetIfBlank(z.string()),
    /** e.g. `Council of Foods <council@council-of-foods.com>`; the name also titles emails. */
    COUNCIL_MAIL_FROM: unsetIfBlank(z.string().regex(/^.+<[^<>\s]+@[^<>\s]+>$/, "expected Name <address>")),
    // Installation bridges: shared key and the venues they can alert.
    COUNCIL_BRIDGE_KEY: unsetIfBlank(z.string().min(16)),
    COUNCIL_VENUES: unsetIfBlank(VenuesEnv),
});

export type EnvConfig = z.infer<typeof EnvSchema>;
