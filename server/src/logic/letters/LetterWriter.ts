import type { Character, Message } from "@shared/ModelTypes.js";
import type { StoredMeeting } from "@models/DBModels.js";
import type { GlobalOptions } from "@logic/GlobalOptions.js";
import type { DialogGenerator } from "@logic/DialogGenerator.js";
import type { Recipient } from "./recipients.js";

import { z } from "zod";
import { formatMeetingDate } from "@shared/topicPrompt.js";
import { requestSpeakerClassifierCompletion } from "@logic/SpeakerClassifierBase.js";
import { getSender, isMailConfigured } from "@services/MailService.js";
import { Logger } from "@utils/Logger.js";
import { buildLetterFooter } from "./footer.js";
import { LETTER_FORMS, RETHINK_ANGLES, letterPrompts, type LetterForm, type LetterReach, type RethinkAngle } from "./prompts/letterPrompts.js";
import { HUMAN_HANDLINGS, humanSortingPrompt, type HumanHandling } from "./prompts/humanSorting.js";

/**
 * The three steps that turn a finished meeting into a letter (see docs/council-letters.md):
 *
 *   1. {@link rankAuthors} and {@link selectAuthor} — the members ranked by how much they have
 *      to say to someone outside the room, and the best of them who has not written lately;
 *   2. {@link planLetter} — that being picks a recipient from the list, decides what to ask,
 *      and says it aloud, ending by asking the visitor to add something;
 *   3. {@link draftLetter} — the letter, written while the announcement plays and the human
 *      thinks, so the human never waits for it;
 *   4. {@link sortHumanAddition} and {@link finishLetter} — what the human added is woven into the
 *      draft by a quick rewrite, set apart as theirs, or left out. The only steps the human waits
 *      for after speaking, so they stay a few seconds.
 *
 * Each is a plain function of a stored meeting and never writes to it, so the evaluation script
 * (scripts/letters/evalLetters.ts) can run them on any meeting, as often as it likes — and the
 * live ending runs exactly the same code. The prompts are in ./prompts, one file per language.
 *
 * Every result carries the exact prompt sent and the model's raw answer, so a bad letter can be
 * traced to what the model was actually asked.
 */

export interface LetterContext {
    meeting: StoredMeeting;
    options: GlobalOptions;
    dialogGenerator: DialogGenerator;
}

/** A step's answer could not be used even after resampling. Carries the last raw answer. */
export class LetterStepError extends Error {
    constructor(step: string, reason: string, readonly raw: string) {
        super(`Letter ${step}: ${reason}`);
        this.name = "LetterStepError";
    }
}

/** How often a step whose answer does not parse is sampled again before giving up. */
const PARSE_ATTEMPTS = 3;
const AUTHOR_MAX_TOKENS = 400;
/** How many of the latest letters' asks the author sees, so it asks something else. */
const RECENT_ASKS_SHOWN = 24;
/** How often a letter reaches past a next step and asks the recipient to rethink (see LETTER_REACHES). */
const RETHINK_SHARE = 1 / 3;
/** How often a letter ends by asking the recipient to write back. */
const REPLY_SHARE = 1 / 2;
const SORTING_MAX_TOKENS = 80;
/** Placeholder names that mean the human gave none. */
const NO_NAME = new Set(["visitor", "human", "besökare", "människa", "guest", "gäst"]);

/** Speaking members who could write: not the chair, not a human panelist. */
export function authorCandidates(meeting: StoredMeeting, chairId: string): Character[] {
    return meeting.characters.filter(
        (character, index) => index !== 0 && character.id !== chairId && !character.id.startsWith("panelist"),
    );
}

/**
 * What was actually said: council turns, the chair's lines and the visitor's words. Synthetic
 * markers (awaiting_*, query_extension) carry no text, and a stored meeting may end in a summary
 * or protocol that the letter must not read as part of the debate.
 */
function spokenTurns(conversation: Message[]): Message[] {
    return conversation.filter(
        (message) =>
            typeof message.text === "string"
            && message.text.trim() !== ""
            && message.type !== "summary"
            && message.type !== "skipped",
    );
}

/** The meeting as the author remembers it: only what was said. */
function spokenMeeting(meeting: StoredMeeting): StoredMeeting {
    return { ...meeting, conversation: spokenTurns(meeting.conversation) };
}

function transcript(meeting: StoredMeeting): string {
    return spokenTurns(meeting.conversation)
        .map((message) => {
            const name = message.type === "human"
                ? (meeting.state?.humanName || "Visitor")
                : (meeting.characters.find((character) => character.id === message.speaker)?.name ?? message.speaker);
            return `${name}: ${message.text}`;
        })
        .join("\n\n");
}

/* -------------------------------------------------------------------------- */
/* 1. Author                                                                  */
/* -------------------------------------------------------------------------- */

export interface RankedAuthor {
    authorId: string;
    reason: string;
}

export interface AuthorRanking {
    /** Every candidate, best first. Candidates the answer left out are appended in meeting order. */
    ranking: RankedAuthor[];
    /** True when the answer named nobody usable and the ranking is the most active speakers first. */
    fallback: boolean;
    prompt: string;
    raw: string;
}

export interface AuthorChoice extends AuthorRanking {
    authorId: string;
    reason: string;
    /** Higher-ranked members passed over because they wrote one of the recent letters. */
    restingAuthors: string[];
}

function mentions(line: string, token: string): boolean {
    const escaped = token.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}])${escaped}($|[^\\p{L}])`, "u").test(line.toLowerCase());
}

/**
 * Reads the model's ranking, one "id: reason" per line. Accepts an id or a name at the start of a
 * line, since a model asked for "reindeer: …" will sometimes write "2. Reindeer — …".
 */
export function parseAuthorRanking(raw: string, candidates: Character[]): RankedAuthor[] {
    const ranked: RankedAuthor[] = [];
    for (const rawLine of raw.split("\n")) {
        const line = rawLine.replace(/[`*"]/g, "").replace(/^\s*\d+[.)]\s*/, "").trim();
        if (!line) continue;
        const separator = line.search(/[:—–]|\s-\s/);
        const head = separator === -1 ? line : line.slice(0, separator);
        const candidate = candidates.find((c) => mentions(head, c.id) || mentions(head, c.name));
        if (!candidate || ranked.some((r) => r.authorId === candidate.id)) continue;
        ranked.push({
            authorId: candidate.id,
            reason: separator === -1 ? "" : line.slice(separator + 1).replace(/^[\s-]+/, "").trim(),
        });
    }
    return ranked;
}

/** The candidates who spoke most — a defensible ranking when the model names nobody. */
function byActivity(meeting: StoredMeeting, candidates: Character[]): RankedAuthor[] {
    const counts = new Map(candidates.map((candidate) => [candidate.id, 0]));
    for (const message of spokenTurns(meeting.conversation)) {
        if (message.speaker && counts.has(message.speaker)) {
            counts.set(message.speaker, (counts.get(message.speaker) ?? 0) + 1);
        }
    }
    return [...candidates]
        .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
        .map((candidate) => ({ authorId: candidate.id, reason: "" }));
}

export async function rankAuthors(ctx: LetterContext): Promise<AuthorRanking> {
    const { meeting, options } = ctx;
    const candidates = authorCandidates(meeting, options.chairId);
    if (candidates.length === 0) {
        throw new LetterStepError("author", "the meeting has no member who could write", "");
    }

    const instruction = letterPrompts(meeting.language).author({
        candidates: candidates.map(({ id, name }) => ({ id, name })),
    });
    const raw = await requestSpeakerClassifierCompletion(
        options,
        [
            { role: "system", content: instruction },
            { role: "user", content: transcript(meeting) },
        ],
        AUTHOR_MAX_TOKENS,
        "LetterWriter.rankAuthors",
        meeting,
    );

    const ranked = parseAuthorRanking(raw, candidates);
    if (ranked.length === 0) {
        Logger.warn("letters", `author ranking named nobody usable, ranking by activity: ${raw.slice(0, 160)}`, {
            from: { meetingId: meeting._id },
        });
        return { ranking: byActivity(meeting, candidates), fallback: true, prompt: instruction, raw };
    }
    const missing = candidates
        .filter((candidate) => !ranked.some((r) => r.authorId === candidate.id))
        .map((candidate) => ({ authorId: candidate.id, reason: "" }));
    return { ranking: [...ranked, ...missing], fallback: false, prompt: instruction, raw };
}

/**
 * The best-ranked member who has not written one of the last `cooldown` letters, so the letters
 * come from many voices without overriding the meeting's judgement of who has most to say. When
 * everyone in the room wrote recently, the one who wrote longest ago.
 *
 * `recentAuthors` is oldest first: the authors of the installation's latest letters.
 */
export function selectAuthor(ranking: AuthorRanking, recentAuthors: string[], cooldown: number): AuthorChoice {
    const resting = new Set(cooldown > 0 ? recentAuthors.slice(-cooldown) : []);
    const fresh = ranking.ranking.find((r) => !resting.has(r.authorId));
    const lastWrote = (id: string) => recentAuthors.lastIndexOf(id);
    const chosen = fresh ?? [...ranking.ranking].sort((a, b) => lastWrote(a.authorId) - lastWrote(b.authorId))[0];
    const restingAuthors = ranking.ranking
        .slice(0, ranking.ranking.indexOf(chosen))
        .map((r) => r.authorId)
        .filter((id) => resting.has(id));
    return { ...ranking, authorId: chosen.authorId, reason: chosen.reason, restingAuthors };
}

export async function pickAuthor(ctx: LetterContext, recentAuthors: string[] = []): Promise<AuthorChoice> {
    return selectAuthor(await rankAuthors(ctx), recentAuthors, ctx.options.letterAuthorCooldown);
}

/* -------------------------------------------------------------------------- */
/* 2. Plan and announcement                                                   */
/* -------------------------------------------------------------------------- */

export interface LetterPlan {
    reach: LetterReach;
    angles: RethinkAngle[];
    recipientId: string;
    points: string[];
    spokenText: string;
    prompt: string;
    raw: string;
    /** How many samples it took to get a usable answer. */
    attempts: number;
}

const PlanAnswerSchema = z.object({
    recipientId: z.string().min(1),
    points: z.array(z.string().min(1)).min(1).max(5),
    spokenText: z.string().min(1),
});

function stripCodeFence(text: string): string {
    return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

/** Every balanced top-level `{…}` in the text, in order, skipping braces inside strings. */
function jsonObjects(text: string): string[] {
    const objects: string[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inString) {
            if (char === "\\") i++;
            else if (char === '"') inString = false;
        } else if (char === '"') {
            if (depth > 0) inString = true;
        } else if (char === "{") {
            if (depth++ === 0) start = i;
        } else if (char === "}" && depth > 0 && --depth === 0) {
            objects.push(text.slice(start, i + 1));
        }
    }
    return objects;
}

/** Keys as the model meant them: `" spokenText"` is spokenText. */
function trimmedKeys(value: unknown): unknown {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key.trim(), inner]));
}

/**
 * Reads the plan's JSON answer. Tolerates a code fence and text around the object, a model that
 * starts over (the last complete object wins), stray spaces in keys and an id written with
 * different case — but never a recipient off the list: that is the one rule the letter cannot bend.
 */
export function parsePlanAnswer(raw: string, candidates: Recipient[]): Pick<LetterPlan, "recipientId" | "points" | "spokenText"> {
    const objects = jsonObjects(raw);
    if (objects.length === 0) throw new Error("no JSON object in the answer");

    let answer: z.infer<typeof PlanAnswerSchema> | undefined;
    let problem: unknown;
    for (const object of objects.reverse()) {
        try {
            answer = PlanAnswerSchema.parse(trimmedKeys(JSON.parse(object)));
            break;
        } catch (error) {
            problem ??= error;
        }
    }
    if (!answer) throw problem;
    const wanted = answer.recipientId.trim().toLowerCase();
    const recipient = candidates.find((candidate) => candidate.id.toLowerCase() === wanted);
    if (!recipient) throw new Error(`recipient "${answer.recipientId}" is not on the list offered`);

    return {
        recipientId: recipient.id,
        points: answer.points.map((point) => point.trim()),
        spokenText: answer.spokenText.trim(),
    };
}

export function formatCandidateList(candidates: Recipient[]): string {
    return candidates
        .map((candidate) => {
            const name = candidate.organisation ? `${candidate.name} (${candidate.organisation})` : candidate.name;
            const record = candidate.facts.length ? candidate.facts.map((fact) => fact.text).join(" / ") : "nothing";
            return `${candidate.id} | ${name} | decides on: ${candidate.remit} | why: ${candidate.why ?? candidate.remit} | on record: ${record}`;
        })
        .join("\n");
}

/**
 * The human's first name, as they gave it during setup or when raising their hand — personal, but
 * no more than a first name reaches a letter. Null when they gave none.
 */
export function humanFirstName(meeting: StoredMeeting): string | null {
    const first = (meeting.state?.humanName ?? "").trim().split(/\s+/)[0] ?? "";
    return first && !NO_NAME.has(first.toLowerCase()) ? first : null;
}

function authorOf(meeting: StoredMeeting, authorId: string): Character {
    const author = meeting.characters.find((character) => character.id === authorId);
    if (!author) throw new LetterStepError("plan", `"${authorId}" is not in this meeting`, "");
    return author;
}

export interface ReachChoice {
    reach: LetterReach;
    /** For a rethink, two different angles to take one of; empty for a next step. */
    angles: RethinkAngle[];
}

/** Most letters ask for a next step; about one in three asks the recipient to rethink, from one of two angles. */
export function selectLetterReach(random: () => number = Math.random): ReachChoice {
    if (random() >= RETHINK_SHARE) return { reach: "step", angles: [] };
    const first = Math.floor(random() * RETHINK_ANGLES.length);
    const second = (first + 1 + Math.floor(random() * (RETHINK_ANGLES.length - 1))) % RETHINK_ANGLES.length;
    return { reach: "rethink", angles: [RETHINK_ANGLES[first], RETHINK_ANGLES[second]] };
}

/**
 * `recentAsks` are the asks of the installation's latest letters, oldest first; the latest
 * {@link RECENT_ASKS_SHOWN} are shown, so the letters on the wall do not all ask the same thing.
 */
export async function planLetter(
    ctx: LetterContext,
    authorId: string,
    candidates: Recipient[],
    choices: ReachChoice & { recentAsks: string[] } = { reach: "step", angles: [], recentAsks: [] },
): Promise<LetterPlan> {
    const { meeting, options, dialogGenerator } = ctx;
    const author = authorOf(meeting, authorId);
    if (candidates.length === 0) {
        throw new LetterStepError("plan", "no recipients are available for this topic", "");
    }

    const instruction = letterPrompts(meeting.language).plan({
        beingName: author.name,
        recipientList: formatCandidateList(candidates),
        humanName: humanFirstName(meeting),
        reach: choices.reach,
        angles: choices.angles,
        recentAsks: choices.recentAsks.slice(-RECENT_ASKS_SHOWN),
    });
    const remembered = spokenMeeting(meeting);

    let raw = "";
    let lastProblem = "";
    for (let attempt = 1; attempt <= PARSE_ATTEMPTS; attempt++) {
        ({ text: raw } = await dialogGenerator.generateInCharacter(
            author, remembered, instruction, options.letterPlanLength, `${author.name}'s letter plan`,
        ));
        try {
            return { reach: choices.reach, angles: choices.angles, ...parsePlanAnswer(raw, candidates), prompt: instruction, raw, attempts: attempt };
        } catch (error) {
            lastProblem = (error as Error).message;
            Logger.warn("letters", `plan answer unusable (attempt ${attempt}/${PARSE_ATTEMPTS}): ${lastProblem}`, {
                from: { meetingId: meeting._id },
            });
        }
    }
    throw new LetterStepError("plan", lastProblem, raw);
}

/* -------------------------------------------------------------------------- */
/* 3. The letter                                                              */
/* -------------------------------------------------------------------------- */

export interface SortedAddition {
    /** What the human said, with contact details already removed. Empty when they said nothing. */
    text: string;
    /** "none" when there was nothing to sort. */
    handling: HumanHandling | "none";
    reason: string;
    raw: string;
}

/**
 * The form used longest ago, so the letters on the wall differ in shape: a form not used in the
 * recent letters first (in list order, after a random rotation so the cycle does not always start
 * the same way), otherwise the one whose last use is oldest. `recentForms` is oldest first.
 */
export function selectLetterForm(recentForms: string[], random: () => number = Math.random): LetterForm {
    const offset = Math.floor(random() * LETTER_FORMS.length);
    const rotated = LETTER_FORMS.map((_, i) => LETTER_FORMS[(i + offset) % LETTER_FORMS.length]);
    const lastUse = (form: string) => recentForms.lastIndexOf(form);
    return [...rotated].sort((a, b) => lastUse(a) - lastUse(b))[0];
}

/** Whether a letter ends by asking the recipient to write back: about half do. */
export function selectAsksReply(random: () => number = Math.random): boolean {
    return random() < REPLY_SHARE;
}

/** A letter before the human has answered: complete, and sendable as it stands if they add nothing. */
export interface LetterDraft {
    form: LetterForm;
    asksReply: boolean;
    authorId: string;
    recipientId: string;
    subject: string;
    body: string;
    prompt: string;
    raw: string;
}

export interface Letter extends LetterDraft {
    /** The human's own words, set apart after the signature; null unless the addition was "apart". */
    humanNote: string | null;
    footer: string;
    human: SortedAddition;
    /** Whether a human's words are part of the letter, woven in or set apart. Only such a letter is ever sent. */
    humanContributed: boolean;
    /** The weave step, when there was one. */
    weave: { prompt: string; raw: string } | null;
}

/**
 * Email addresses and phone numbers in what a human says. They never reach the model: a letter
 * goes to a real person, and the prompt asking it not to copy them is not the only safeguard.
 */
const CONTACT_DETAILS = [
    /[\p{L}\d._%+-]+@[\p{L}\d.-]+\.\p{L}{2,}/gu,
    /(?<![\d-])(?:\+?\d[\d\s-]{6,}\d)(?![\d-])/g,
];

export function withoutContactDetails(text: string): string {
    return CONTACT_DETAILS.reduce((result, pattern) => result.replace(pattern, "[removed]"), text);
}

const SUBJECT_LINE = /^\s*[#*_\s]*(subject|ämne|amne)\s*[*_]*\s*:\s*[*_]*\s*(.+?)\s*[*_]*\s*$/i;

/**
 * Splits "Subject: …" from the body. A letter without a subject line keeps its whole text as the
 * body and gets an empty subject, which the caller can fill; it is never thrown away for it.
 */
export function parseLetterAnswer(raw: string): { subject: string; body: string } {
    const lines = stripCodeFence(raw).split("\n");
    // Models often open with a separator ("---") before the subject line.
    const subjectIndex = lines.findIndex((line) => line.trim() !== "" && !/^\s*([-*_=])\1{2,}\s*$/.test(line));
    const match = subjectIndex === -1 ? null : SUBJECT_LINE.exec(lines[subjectIndex]);

    const bodyLines = match ? lines.slice(subjectIndex + 1) : lines;
    const body = bodyLines
        .join("\n")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/^#+\s*/gm, "")
        .trim();

    return { subject: match ? match[2].trim() : "", body };
}

/** Reads "weave: reason". Anything unreadable is set apart: the human's words, kept as theirs. */
export function parseHumanHandling(raw: string): { handling: HumanHandling; reason: string } {
    const cleaned = raw.replace(/[`*"]/g, "").trim();
    const word = cleaned.match(/^[\p{L}]+/u)?.[0]?.toLowerCase();
    const handling = (HUMAN_HANDLINGS as readonly string[]).includes(word ?? "") ? (word as HumanHandling) : "apart";
    const colon = cleaned.indexOf(":");
    return { handling, reason: colon === -1 ? "" : cleaned.slice(colon + 1).trim() };
}

/**
 * Decides how the human's addition goes into the letter: woven in by the author, set apart as the
 * human's own words, or left out. Contact details are removed before any model sees it.
 */
export async function sortHumanAddition(ctx: LetterContext, addition: string): Promise<SortedAddition> {
    const text = withoutContactDetails(addition.trim());
    if (text === "") return { text, handling: "none", reason: "", raw: "" };

    const raw = await requestSpeakerClassifierCompletion(
        ctx.options,
        [
            { role: "system", content: humanSortingPrompt() },
            { role: "user", content: text },
        ],
        SORTING_MAX_TOKENS,
        "LetterWriter.sortHumanAddition",
        ctx.meeting,
    );
    return { text, ...parseHumanHandling(raw), raw };
}

function contactEmail(): string {
    return isMailConfigured() ? getSender().email : "[CONTACT_EMAIL]";
}

function recipientDisplayName(recipient: Recipient): string {
    return recipient.organisation ? `${recipient.name}, ${recipient.organisation}` : recipient.name;
}

export async function draftLetter(
    ctx: LetterContext,
    input: { authorId: string; recipient: Recipient; points: string[]; form: LetterForm; asksReply: boolean },
): Promise<LetterDraft> {
    const { meeting, options, dialogGenerator } = ctx;
    const author = authorOf(meeting, input.authorId);

    const instruction = letterPrompts(meeting.language).draft({
        form: input.form,
        asksReply: input.asksReply,
        authorId: author.id,
        beingName: author.name,
        recipientName: recipientDisplayName(input.recipient),
        recipientWhy: input.recipient.why ?? input.recipient.remit,
        recipientFacts: input.recipient.facts.map((fact) => fact.text),
        points: input.points,
        meetingId: meeting._id,
        date: formatMeetingDate(new Date(meeting.date), meeting.language),
    });

    const { text: raw } = await dialogGenerator.generateInCharacter(
        author, spokenMeeting(meeting), instruction, options.letterWriteLength, `${author.name}'s letter`,
    );
    const { subject, body } = parseLetterAnswer(raw);
    if (body === "") throw new LetterStepError("letter", "the letter came back empty", raw);

    return { form: input.form, asksReply: input.asksReply, authorId: author.id, recipientId: input.recipient.id, subject, body, prompt: instruction, raw };
}

/**
 * The letter as it will be sent: the human's words woven into the draft by a quick rewrite in the
 * author's voice, or set apart after the signature as theirs, or nothing at all. A weave that comes
 * back empty keeps the draft and sets the words apart instead — the human is never dropped silently.
 */
export async function finishLetter(
    ctx: LetterContext,
    draft: LetterDraft,
    recipient: Recipient,
    human: SortedAddition,
): Promise<Letter> {
    const { meeting, options, dialogGenerator } = ctx;
    const author = authorOf(meeting, draft.authorId);
    const prompts = letterPrompts(meeting.language);
    const humanName = humanFirstName(meeting);

    let { subject, body } = draft;
    let handling = human.handling;
    let weave: Letter["weave"] = null;

    if (handling === "weave") {
        const instruction = prompts.weave({
            beingName: author.name,
            recipientName: recipientDisplayName(recipient),
            subject,
            body,
            addition: human.text,
            humanName,
            meetingId: meeting._id,
        });
        const { text: raw } = await dialogGenerator.generateInCharacter(
            author, meeting, instruction, options.letterWriteLength, `${author.name}'s letter, with the human's words`,
            { withConversation: false, model: { model: options.letterWeaveModel, reasoning: options.letterWeaveReasoning } },
        );
        weave = { prompt: instruction, raw };
        const woven = parseLetterAnswer(raw);
        if (woven.body) {
            subject = woven.subject || subject;
            body = woven.body;
        } else {
            Logger.warn("letters", "weave came back empty; setting the human's words apart instead", { from: { meetingId: meeting._id } });
            handling = "apart";
        }
    }

    const humanContributed = handling === "weave" || handling === "apart";
    return {
        ...draft,
        subject,
        body,
        humanNote: handling === "apart" ? prompts.humanApart(human.text, humanName) : null,
        footer: buildLetterFooter(options, {
            language: meeting.language,
            meetingId: meeting._id,
            beingName: author.name,
            humanContributed,
            contactEmail: contactEmail(),
        }),
        human: { ...human, handling },
        humanContributed,
        weave,
    };
}
