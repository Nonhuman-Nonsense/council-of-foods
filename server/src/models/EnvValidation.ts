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
    /**
     * Whether meetings' letters go out (docs/council-letters.md): `off` queues them and sends
     * nothing (the default, and the kill switch), `test` sends every letter to
     * COUNCIL_LETTERS_TEST_TO instead of its recipient, `live` sends to the recipient.
     */
    COUNCIL_LETTERS: unsetIfBlank(z.enum(["off", "test", "live"])),
    COUNCIL_LETTERS_TEST_TO: unsetIfBlank(z.email()),
    /** Gets a copy of every letter sent live, every reply, and every recipient blocked. Unset: no copies. */
    COUNCIL_LETTERS_ARCHIVE_TO: unsetIfBlank(z.email()),
    /** In the URLs Brevo posts replies and delivery events to; without it, both are refused. */
    COUNCIL_LETTERS_WEBHOOK_SECRET: unsetIfBlank(z.string().min(16)),
    // One key for an installation's devices: the bridge (printer alerts) and the room power plugs.
    COUNCIL_INSTALLATION_KEY: unsetIfBlank(z.string().min(16)),
    // Where installations run: printer alert addresses, opening hours, room power plugs.
    COUNCIL_VENUES: unsetIfBlank(VenuesEnv),
});

export type EnvConfig = z.infer<typeof EnvSchema>;
