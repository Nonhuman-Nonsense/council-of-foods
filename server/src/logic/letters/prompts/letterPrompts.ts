import { buildEnLetterPrompts } from "./letterPromptEn.js";
import { buildSvLetterPrompts } from "./letterPromptSv.js";

/**
 * Everything the letter writer says to a model, and the text around every letter, per language.
 * Written as code rather than JSON so the prompts read as text — conditionals and lists inline —
 * the same way the setup agent's prompts are (client/src/setupAgent/setupAgentPrompt*.ts).
 *
 * The council and venue are named here, so these files differ between Council of Foods and
 * Council of Forest.
 */

export interface AuthorPromptParams {
    candidates: Array<{ id: string; name: string }>;
}

export interface PlanPromptParams {
    beingName: string;
    /** One recipient per line: `id | name | decides on | why | on record`. */
    recipientList: string;
    /** The human taking part, by first name, when they gave one. */
    humanName: string | null;
}

/**
 * The shapes a letter can take. Chosen in rotation (the one used longest ago next), so letters
 * pinned side by side on the wall differ in shape, not only in wording.
 */
export const LETTER_FORMS = ["requests", "appeal", "testimony", "questions", "invitation", "recognition", "note", "then-and-later"] as const;
export type LetterForm = (typeof LETTER_FORMS)[number];

export interface DraftPromptParams {
    form: LetterForm;
    beingName: string;
    recipientName: string;
    recipientWhy: string;
    /** What is on record about the recipient, sourced; the only things the letter may say they did. */
    recipientFacts: string[];
    points: string[];
    meetingId: number;
    /** Already formatted for the language. */
    date: string;
}

export interface WeavePromptParams {
    beingName: string;
    recipientName: string;
    subject: string;
    body: string;
    /** What the human added, contact details removed. */
    addition: string;
    humanName: string | null;
    meetingId: number;
}

export interface FooterParams {
    beingName: string;
    meetingId: number;
    meetingUrl: string;
    contactEmail: string;
    /** Whether a human's words are part of the letter. */
    humanContributed: boolean;
}

export interface LetterPrompts {
    /** System prompt for the classifier that ranks the possible authors; the transcript follows it. */
    author(params: AuthorPromptParams): string;
    /** Appended after the meeting, in the author's own context. Must ask for JSON. */
    plan(params: PlanPromptParams): string;
    /**
     * Appended after the meeting, in the author's own context. Written before the human has
     * answered, so the human never waits for it. Must ask for "Subject:" first.
     */
    draft(params: DraftPromptParams): string;
    /** In the author's voice but without the meeting: folds the human's words into the draft. */
    weave(params: WeavePromptParams): string;
    /** Not a prompt: the human's own words, set apart after the letter's signature. */
    humanApart(text: string, humanName: string | null): string;
    /** Not a prompt: appended after the letter, never seen by a model. */
    footer(params: FooterParams): string;
}

/** Add an entry here when adding a language. */
const builders: Record<string, () => LetterPrompts> = {
    en: buildEnLetterPrompts,
    sv: buildSvLetterPrompts,
};

export function letterPrompts(language: string): LetterPrompts {
    return (builders[language] ?? buildEnLetterPrompts)();
}
