import { z } from "zod";
import { TEST_MODES } from "@interfaces/TestModes.js";

// --- Environment Variables Schema ---
export const EnvSchema = z.object({
    COUNCIL_DB_URL: z.string().url(),
    COUNCIL_DB_PREFIX: z.string(),
    COUNCIL_OPENAI_API_KEY: z.string().min(1, "COUNCIL_OPENAI_API_KEY is required"),
    PORT: z.string().default("3001").transform((val) => parseInt(val, 10)),
    NODE_ENV: z.enum(["development", "production", "test", "prototype"]).default("production"),
    COUNCIL_ERRORBOT: z.string().optional(),
    TEST_MODE: z.enum(TEST_MODES).optional(),
    USE_TEST_OPTIONS: z.enum(["true", "false"]).transform((val) => val === "true").optional()
});

export type EnvConfig = z.infer<typeof EnvSchema>;
