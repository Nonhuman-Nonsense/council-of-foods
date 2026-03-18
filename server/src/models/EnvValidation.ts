import { z } from "zod";
import { TEST_MODES } from "@interfaces/TestModes.js";

// --- Environment Variables Schema ---
export const EnvSchema = z.object({
    COUNCIL_DB_URL: z.url(),
    COUNCIL_DB_PREFIX: z.string(),
    COUNCIL_OPENAI_API_KEY: z.string().min(1),
    PORT: z.string().default("3001").transform((val) => parseInt(val, 10)),
    NODE_ENV: z.enum(["development", "production", "test", "prototype"]).default("production"),
    COUNCIL_ERRORBOT: z.string().optional(),
    TEST_MODE: z.enum(TEST_MODES).optional(),
    USE_TEST_OPTIONS: z.enum(["true", "false"]).transform((val) => val === "true").optional(),
    GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1),
    INWORLD_API_KEY: z.string().min(1)
});

export type EnvConfig = z.infer<typeof EnvSchema>;
