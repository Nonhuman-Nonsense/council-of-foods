import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

/**
 * The people and institutions a being may write to (see docs/council-letters.md).
 *
 * The list is curated by hand and lives with the other per-product content in
 * `shared/prompts/letters/*.json`, one or more files concatenated. A product without the
 * directory has no recipients, and so no letters. The council only ever writes to an entry
 * from this list, chosen by id: no model writes an address.
 */

export const RECIPIENTS_DIR = path.join(process.cwd(), "../shared/prompts/letters");

/** The topic id of a visitor's own question: every recipient is relevant to it. */
export const CUSTOM_TOPIC_ID = "customtopic";

export const RecipientSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** An institution may take repeat letters within a cap; a person receives exactly one. */
    kind: z.enum(["institution", "person"]),
    category: z.string(),
    organisation: z.string().nullish(),
    email: z.email().nullable(),
    language: z.string(),
    /** What they decide on or study, in plain terms. */
    remit: z.string(),
    /** Finishes "we write to you because …": what the author chooses on, and the letter opens with. */
    why: z.string().nullish(),
    topics: z.array(z.string()),
    active: z.boolean(),
    /**
     * What is on record about this recipient's own actions — a vote, a decision, a statement, a
     * finding — each with where it was verified and when. The only things a letter may say the
     * recipient did, so every one must be sourced.
     */
    facts: z.array(z.object({
        text: z.string().min(1),
        source: z.url(),
        /** When the fact was verified, YYYY-MM-DD. */
        checked: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })).default([]),
});

export type Recipient = z.infer<typeof RecipientSchema>;

const RecipientFileSchema = z.object({
    recipients: z.array(RecipientSchema),
});

export interface RecipientFile {
    name: string;
    content: unknown;
}

/**
 * Validates every file and returns the combined list. Throws on anything that would let a
 * letter go wrong later: two entries with one id, an active entry the author could pick but
 * the letter could not be sent to or explained, or a topic the council never discusses.
 * Inactive entries are curation notes and may be incomplete.
 */
export function parseRecipientFiles(files: RecipientFile[], knownTopicIds: string[]): Recipient[] {
    const known = new Set(knownTopicIds);
    const seen = new Map<string, string>();
    const all: Recipient[] = [];
    const problems: string[] = [];

    for (const file of files) {
        const parsed = RecipientFileSchema.safeParse(file.content);
        if (!parsed.success) {
            problems.push(`${file.name}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
            continue;
        }

        for (const recipient of parsed.data.recipients) {
            const where = `${file.name}: ${recipient.id}`;
            const earlier = seen.get(recipient.id);
            if (earlier) problems.push(`${where} duplicates an id in ${earlier}`);
            seen.set(recipient.id, file.name);

            if (recipient.active) {
                if (!recipient.email) problems.push(`${where} is active without an email`);
                if (!recipient.why?.trim()) problems.push(`${where} is active without a why`);
                if (recipient.topics.length === 0) problems.push(`${where} is active without topics`);
            }
            for (const topic of recipient.topics) {
                if (!known.has(topic)) problems.push(`${where} has unknown topic "${topic}"`);
            }
            all.push(recipient);
        }
    }

    if (problems.length > 0) {
        throw new Error(`Invalid letter recipients:\n${problems.join("\n")}`);
    }
    return all;
}

/** The topic ids recipients may be tagged with: every listed topic, plus the visitor's own. */
export async function loadTopicIds(promptsDir = path.join(process.cwd(), "../shared/prompts")): Promise<string[]> {
    const topics = JSON.parse(await readFile(path.join(promptsDir, "topics_en.json"), "utf8")) as {
        topics: Array<{ id: string }>;
    };
    return [...topics.topics.map((topic) => topic.id), CUSTOM_TOPIC_ID];
}

/** Reads and validates every recipient file. No directory means no recipients. */
export async function loadRecipients(knownTopicIds: string[], dir = RECIPIENTS_DIR): Promise<Recipient[]> {
    let names: string[];
    try {
        names = (await readdir(dir)).filter((name) => name.endsWith(".json")).sort();
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
    }

    const files = await Promise.all(
        names.map(async (name) => ({ name, content: JSON.parse(await readFile(path.join(dir, name), "utf8")) })),
    );
    return parseRecipientFiles(files, knownTopicIds);
}

/**
 * The recipients an author may choose from for a meeting on `topicId`: active, relevant to the
 * topic, and not excluded (a person who already received their one letter, an institution at
 * its cap). A visitor's own question is relevant to everyone.
 *
 * Shuffled and capped, so a long list stays a real choice for the model rather than a wall of
 * text it skims from the top.
 */
export function candidateRecipients(
    recipients: Recipient[],
    topicId: string,
    options: { max: number; exclude?: ReadonlySet<string>; random?: () => number },
): Recipient[] {
    const random = options.random ?? Math.random;
    const eligible = recipients.filter(
        (recipient) =>
            recipient.active
            && !options.exclude?.has(recipient.id)
            && (topicId === CUSTOM_TOPIC_ID || recipient.topics.includes(topicId)),
    );

    for (let i = eligible.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
    }
    return eligible.slice(0, options.max);
}
