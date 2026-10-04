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
    /** One recipient per line: `id | name | decides on | why`. Their record is only shown when writing. */
    recipientList: string;
    /** The human taking part, by first name, when they gave one. */
    humanName: string | null;
    /** What the installation's latest letters asked, oldest first, so this one asks something else. */
    recentAsks: string[];
}

/**
 * What a letter leans towards, inside the fixed frame of a letter (salutation, "you", signature).
 * Chosen in rotation (the one used longest ago next), so letters pinned side by side differ in
 * what they do, while all still read as letters to someone.
 */
export const LETTER_FORMS = ["requests", "appeal", "questions", "invitation", "recognition", "note"] as const;
export type LetterForm = (typeof LETTER_FORMS)[number];

export interface DraftPromptParams {
    form: LetterForm;
    /** Whether this letter ends by asking the recipient to write back. Not every letter does. */
    asksReply: boolean;
    /** For the being's own letter voice, when its speech needs one (see the language files). */
    authorId: string;
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
    /** Whether a human's words are part of the letter. */
    humanContributed: boolean;
}

export interface LetterPrompts {
    /**
     * Appended to the chair's closing prompt: after "This concludes … meeting #N", the chair hands
     * over to the author, who will announce the letter next.
     */
    bridge(params: { authorName: string }): string;
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
