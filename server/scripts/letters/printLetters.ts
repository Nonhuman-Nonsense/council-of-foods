/**
 * Fills a print run of letters (e.g. the wall at Havremagasinet) up to `--total`: the finished
 * letters read by exportForPrint.ts, and for the rest new letters written for the latest completed
 * meetings that ended without one, by the same steps a live meeting takes (author, plan, draft,
 * finish), with no addition from a human. Nothing is written to any database and nothing is sent:
 * the letter steps are called directly, never the outbox.
 *
 * Generated letters are written oldest meeting first with a running history, as they would have
 * been across the exhibition, so authors rest, forms rotate, asks do not repeat and no recipient is
 * written to twice in the set while others are left. Progress is kept in generated.json, so a
 * second run picks up where a failed one stopped.
 *
 *   npm run letters:print -- [--total 60] [--parallel 4] [--dir scripts/letters/print-out]
 *
 * Writes <dir>/letters.json: every letter of the run, oldest meeting first, as LetterViews.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Collection } from "mongodb";
import type { LetterView } from "@shared/ModelTypes.js";
import type { StoredMeeting } from "@models/DBModels.js";
import { getOpenAI, initOpenAI } from "@services/OpenAIService.js";
import { createConversationService } from "@services/ConversationService.js";
import { DialogGenerator } from "@logic/DialogGenerator.js";
import { getGlobalOptions } from "@logic/GlobalOptions.js";
import { candidateRecipients, loadRecipients, loadTopicIds, type Recipient } from "@logic/letters/recipients.js";
import {
    draftLetter,
    finishLetter,
    planLetter,
    rankAuthors,
    selectAsksReply,
    selectAuthor,
    selectLetterForm,
    type AuthorRanking,
    type LetterContext,
    type SortedAddition,
} from "@logic/letters/LetterWriter.js";
import { letterSender } from "@logic/letters/outbox.js";
import { RECENT_LETTERS } from "@logic/letters/history.js";
import type { LetterForm } from "@logic/letters/prompts/letterPrompts.js";
import type { PrintExport } from "./exportForPrint.js";

function arg(name: string, fallback: string): string {
    const index = process.argv.indexOf(`--${name}`);
    return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const TOTAL = Number(arg("total", "60"));
const PARALLEL = Number(arg("parallel", "4"));
const DIR = path.resolve(arg("dir", "scripts/letters/print-out"));
const GENERATED_FILE = path.join(DIR, "generated.json");

const NO_ADDITION: SortedAddition = { text: "", handling: "none", reason: "", raw: "" };

export interface PrintLetter {
    meetingId: number;
    language: string;
    date: string;
    venueId: string | null;
    /** Written for this print run, not by the meeting itself. */
    generated: boolean;
    letter: LetterView;
}

interface Generated extends PrintLetter {
    recipientId: string;
    form: LetterForm;
    points: string[];
}

interface Planned {
    meeting: StoredMeeting;
    authorId: string;
    recipient: Recipient;
    points: string[];
    form: LetterForm;
    asksReply: boolean;
}

async function readGenerated(): Promise<Generated[]> {
    try {
        return JSON.parse(await readFile(GENERATED_FILE, "utf8")) as Generated[];
    } catch {
        return [];
    }
}

/** Runs `work` over `items`, `PARALLEL` at a time, keeping the input order in the result. */
async function pooled<T, R>(items: T[], work: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: PARALLEL }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await work(items[index]);
        }
    }));
    return results;
}

async function main() {
    const data = JSON.parse(await readFile(path.join(DIR, "export.json"), "utf8")) as PrintExport;
    const options = getGlobalOptions();
    initOpenAI();
    // The letter steps never touch the meetings collection; there is no database here.
    const dialogGenerator = new DialogGenerator(
        { conversationService: createConversationService(getOpenAI), meetingsCollection: undefined as unknown as Collection<StoredMeeting> },
        options,
    );
    const recipients = await loadRecipients(await loadTopicIds());

    const missing = Math.max(0, TOTAL - data.letters.length);
    const chosen = data.candidates.slice(0, missing).reverse(); // oldest first
    if (chosen.length < missing) console.warn(`Only ${chosen.length} meetings to write for; the run will have ${data.letters.length + chosen.length} letters.`);

    const generated = (await readGenerated()).filter((g) => chosen.some((m) => m._id === g.meetingId));
    const done = new Set(generated.map((g) => g.meetingId));
    const todo = chosen.filter((m) => !done.has(m._id));
    console.log(`${data.letters.length} finished letters, ${generated.length} already generated, ${todo.length} to write with ${options.letterModel}.\n`);

    const save = async () => {
        generated.sort((a, b) => a.meetingId - b.meetingId);
        await writeFile(GENERATED_FILE, JSON.stringify(generated, null, 2));
    };
    const context = (meeting: StoredMeeting): LetterContext => ({ meeting, options, dialogGenerator });

    // 1. Rank the authors of every meeting at once; the choice itself waits for the history.
    const rankings: Array<AuthorRanking | null> = await pooled(todo, async (meeting) => {
        try {
            return await rankAuthors(context(meeting));
        } catch (error) {
            console.error(`✘ #${meeting._id} rank: ${(error as Error).message}`);
            return null;
        }
    });

    // 2. Author and plan, one meeting after another, each seeing the letters before it. The
    // history is the generated letters (the real ones are all newer than these meetings), and the
    // recipients already used anywhere in the run, so the wall does not repeat itself.
    const used = new Set([
        ...data.letters.flatMap((l) => recipients.filter((r) => r.name === l.letter.recipientName).map((r) => r.id)),
        ...generated.map((g) => g.recipientId),
    ]);
    const blocked = new Set(data.blocked);
    const planned: Planned[] = [];
    for (const [i, meeting] of todo.entries()) {
        const ranking = rankings[i];
        if (!ranking) continue;
        const recent = [...generated, ...planned.map((p) => ({ form: p.form, points: p.points, letter: { authorId: p.authorId } }))].slice(-RECENT_LETTERS);
        try {
            const author = selectAuthor(ranking, recent.map((r) => r.letter.authorId), options.letterAuthorCooldown);
            const fresh = candidateRecipients(recipients, meeting.topic.id, {
                max: options.letterMaxCandidates,
                exclude: new Set([...blocked, ...used]),
            });
            const candidates = fresh.length > 0 ? fresh : candidateRecipients(recipients, meeting.topic.id, { max: options.letterMaxCandidates, exclude: blocked });
            const plan = await planLetter(context(meeting), author.authorId, candidates, recent.flatMap((r) => r.points));
            const recipient = recipients.find((r) => r.id === plan.recipientId);
            if (!recipient) throw new Error(`planned recipient ${plan.recipientId} is not on the list`);
            used.add(recipient.id);
            planned.push({
                meeting,
                authorId: author.authorId,
                recipient,
                points: plan.points,
                form: selectLetterForm(recent.map((r) => r.form)),
                asksReply: selectAsksReply(),
            });
            console.log(`  planned #${meeting._id} (${meeting.language}): ${author.authorId} → ${recipient.id}`);
        } catch (error) {
            console.error(`✘ #${meeting._id} plan: ${(error as Error).message}`);
        }
    }

    // 3. Draft and finish, several at a time; each is saved as soon as it is written.
    let failed = todo.length - planned.length;
    await pooled(planned, async (p) => {
        try {
            const ctx = context(p.meeting);
            const draft = await draftLetter(ctx, { authorId: p.authorId, recipient: p.recipient, points: p.points, form: p.form, asksReply: p.asksReply });
            const finished = await finishLetter(ctx, draft, p.recipient, NO_ADDITION);
            const author = p.meeting.characters.find((c) => c.id === p.authorId)!;
            generated.push({
                meetingId: p.meeting._id,
                language: p.meeting.language,
                date: p.meeting.date,
                venueId: p.meeting.venueId ?? null,
                generated: true,
                recipientId: p.recipient.id,
                form: p.form,
                points: p.points,
                letter: {
                    authorId: author.id,
                    authorName: author.name,
                    authorEmail: letterSender(options, author.id, author.name).email,
                    recipientName: p.recipient.name,
                    recipientOrganisation: p.recipient.organisation ?? null,
                    recipientEmail: p.recipient.email,
                    sentAt: p.meeting.date,
                    subject: finished.subject,
                    body: finished.body,
                    humanNote: finished.humanNote,
                    footer: finished.footer,
                    present: true,
                    send: false,
                    sendReason: "written afterwards for a print run",
                },
            });
            await save();
            console.log(`✔ #${p.meeting._id} ${author.name} → ${p.recipient.name}: ${finished.subject}`);
        } catch (error) {
            failed++;
            console.error(`✘ #${p.meeting._id} letter: ${(error as Error).message}`);
        }
    });
    await save();

    const all: PrintLetter[] = [
        ...data.letters.map(({ meetingId, language, date, venueId, letter }) => ({ meetingId, language, date, venueId, generated: false, letter })),
        ...generated.map(({ meetingId, language, date, venueId, letter }) => ({ meetingId, language, date, venueId, generated: true, letter })),
    ].sort((a, b) => a.meetingId - b.meetingId);
    await writeFile(path.join(DIR, "letters.json"), JSON.stringify(all, null, 2));

    const count = (language: string) => all.filter((l) => l.language === language).length;
    console.log(`\n${all.length} letters (sv ${count("sv")}, en ${count("en")}) in ${path.join(DIR, "letters.json")}${failed ? `; ${failed} failed — run again to retry them` : ""}.`);
    process.exit(failed ? 1 : 0);
}

await main();
