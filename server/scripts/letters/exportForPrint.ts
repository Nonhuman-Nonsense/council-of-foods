/**
 * Reads what a print run of letters needs from the database (production through
 * `npm run prod -- letters:export`, read-only): every finished letter as its summary shows it, the
 * latest completed meetings that ended without one (so printLetters.ts can write theirs), and the
 * letter history that keeps authors, forms, asks and recipients varied. Writes nothing to the
 * database.
 *
 *   npm run prod -- letters:export [--candidates 120] [--min-turns 8] [--out scripts/letters/print-out/export.json]
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LetterView } from "@shared/ModelTypes.js";
import type { StoredMeeting } from "@models/DBModels.js";
import { closeDb, initDb, letterBlocklistCollection, lettersCollection, meetingsCollection } from "@services/DbService.js";

function arg(name: string, fallback: string): string {
    const index = process.argv.indexOf(`--${name}`);
    return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const CANDIDATES = Number(arg("candidates", "120"));
const MIN_TURNS = Number(arg("min-turns", "8"));
const OUT = path.resolve(arg("out", "scripts/letters/print-out/export.json"));

export interface ExportedLetter {
    meetingId: number;
    language: string;
    date: string;
    venueId: string | null;
    letter: LetterView;
    form: string | null;
    points: string[];
}

export interface PrintExport {
    exportedAt: string;
    letters: ExportedLetter[];
    /** Newest first. */
    candidates: StoredMeeting[];
    sentRecipients: Array<{ recipientId: string; sentAt: string | null }>;
    blocked: string[];
}

const spokenTurns = (meeting: StoredMeeting) =>
    meeting.conversation.filter((m) => typeof m.text === "string" && m.text.trim() !== "" && m.type !== "summary" && m.type !== "skipped").length;

async function main() {
    await initDb(undefined, undefined, { readOnly: true });

    const finished = await meetingsCollection.find({ "letter.finishedAt": { $exists: true } }).sort({ _id: 1 }).toArray();
    const letters: ExportedLetter[] = finished.flatMap((meeting) => {
        const summary = meeting.conversation.find((m) => m.type === "summary");
        const view = summary?.type === "summary" ? summary.letter : undefined;
        if (!view) {
            console.warn(`#${meeting._id}: a finished letter but no summary carrying it, skipped`);
            return [];
        }
        return [{
            meetingId: meeting._id,
            language: meeting.language,
            date: meeting.date,
            venueId: meeting.venueId ?? null,
            letter: view,
            form: meeting.letter?.form ?? null,
            points: meeting.letter?.points ?? [],
        }];
    });

    // Completed: the meeting reached its protocol. Read in pages until enough long ones are found.
    const candidates: StoredMeeting[] = [];
    const cursor = meetingsCollection
        .find({ letter: { $exists: false }, devCorpus: { $exists: false }, "conversation.type": "summary" })
        .sort({ _id: -1 });
    for await (const meeting of cursor) {
        if (spokenTurns(meeting) >= MIN_TURNS && meeting.characters.length >= 3) candidates.push(meeting);
        if (candidates.length >= CANDIDATES) break;
    }
    await cursor.close();

    const [sent, blocked] = await Promise.all([
        lettersCollection.find({ status: "sent", mode: "live" }, { projection: { recipientId: 1, sentAt: 1 } }).toArray(),
        letterBlocklistCollection.find({}, { projection: { _id: 1 } }).toArray(),
    ]);

    const data: PrintExport = {
        exportedAt: new Date().toISOString(),
        letters,
        candidates,
        sentRecipients: sent.map((s) => ({ recipientId: s.recipientId, sentAt: s.sentAt ? new Date(s.sentAt).toISOString() : null })),
        blocked: blocked.map((b) => b._id),
    };
    await mkdir(path.dirname(OUT), { recursive: true });
    await writeFile(OUT, JSON.stringify(data, null, 2));

    const byLanguage = (items: Array<{ language: string }>) =>
        Object.entries(items.reduce<Record<string, number>>((n, i) => ({ ...n, [i.language]: (n[i.language] ?? 0) + 1 }), {}))
            .map(([language, n]) => `${language} ${n}`).join(", ");
    console.log(`${letters.length} finished letters (${byLanguage(letters)}), ${letters.filter((l) => l.letter.present).length} with the human present.`);
    console.log(`${candidates.length} completed meetings without a letter (${byLanguage(candidates)}), newest #${candidates[0]?._id ?? "–"}, oldest #${candidates.at(-1)?._id ?? "–"}.`);
    console.log(`Wrote ${OUT}`);
    await closeDb();
}

await main();
