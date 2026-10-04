import type { Collection } from "mongodb";
import type { MeetingLetter, StoredMeeting } from "@models/DBModels.js";
import type { Recipient } from "./recipients.js";

/**
 * What earlier letters mean for the next one (see docs/council-letters.md): whose turn it is to
 * rest, which forms and asks were used lately, and who may not be written to again.
 *
 * Variety is read from every finished letter, sent or not — they hang side by side either way.
 * The limits count only letters actually sent: a letter nobody received uses up nobody.
 */

/** Earlier letters read back for variety: enough for the author rest, the form cycle and the asks shown. */
export const RECENT_LETTERS = 12;
/** An institution takes at most one sent letter a day; a person exactly one, ever. */
const INSTITUTION_REST_MS = 24 * 60 * 60 * 1000;

export interface LetterHistory {
    /** Oldest first. */
    recentAuthors: string[];
    recentForms: string[];
    recentAsks: string[];
    /** Recipients not to offer: people who received a letter, institutions that did today. */
    exclude: Set<string>;
}

type SentLetter = Pick<MeetingLetter, "recipientId" | "finishedAt">;

/** `recent` newest first, as the database returns it. */
export function letterHistory(
    recent: MeetingLetter[],
    sent: SentLetter[],
    recipients: Recipient[],
    now: Date,
): LetterHistory {
    const oldestFirst = [...recent].reverse();
    const kindOf = new Map(recipients.map((recipient) => [recipient.id, recipient.kind]));
    const exclude = new Set<string>();
    for (const letter of sent) {
        if (!letter.recipientId) continue;
        const kind = kindOf.get(letter.recipientId);
        const age = now.getTime() - new Date(letter.finishedAt ?? 0).getTime();
        if (kind === "person" || (kind === "institution" && age < INSTITUTION_REST_MS)) {
            exclude.add(letter.recipientId);
        }
    }
    return {
        recentAuthors: oldestFirst.map((letter) => letter.authorId),
        recentForms: oldestFirst.flatMap((letter) => (letter.form ? [letter.form] : [])),
        recentAsks: oldestFirst.flatMap((letter) => letter.points ?? []),
        exclude,
    };
}

export async function loadLetterHistory(
    meetings: Collection<StoredMeeting>,
    recipients: Recipient[],
    options: { now: Date; excludeMeetingId: number },
): Promise<LetterHistory> {
    const [recent, sent] = await Promise.all([
        meetings
            .find(
                { "letter.finishedAt": { $exists: true }, _id: { $ne: options.excludeMeetingId } },
                { projection: { letter: 1 }, sort: { _id: -1 }, limit: RECENT_LETTERS },
            )
            .toArray(),
        meetings
            .find({ "letter.send": true }, { projection: { "letter.recipientId": 1, "letter.finishedAt": 1 } })
            .toArray(),
    ]);
    return letterHistory(
        recent.flatMap((meeting) => (meeting.letter ? [meeting.letter] : [])),
        sent.flatMap((meeting) => (meeting.letter ? [meeting.letter] : [])),
        recipients,
        options.now,
    );
}
