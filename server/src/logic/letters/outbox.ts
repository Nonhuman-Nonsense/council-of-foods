import type { Collection } from "mongodb";
import type { BlockedRecipient, OutboxLetter, StoredMeeting } from "@models/DBModels.js";
import type { GlobalOptions } from "@logic/GlobalOptions.js";
import { BrevoRefusedError, type Email } from "@services/MailService.js";
import type { Recipient } from "./recipients.js";
import { randomBytes } from "node:crypto";
import { Logger } from "@utils/Logger.js";

/**
 * The outbox (docs/council-letters.md → Outbox): how a finished letter reaches its recipient.
 *
 * The meeting never sends. A worker, on its own clock, does two things:
 *
 *   1. {@link queueFinishedLetters} — every finished letter marked to send that is not yet in
 *      the outbox gets one record there, keyed by its meeting, so it can never be queued twice
 *      and a crash at the end of a meeting cannot lose it;
 *   2. {@link sendNextLetter} — claims the oldest queued letter (`sending`, before Brevo is
 *      called, so two turns never send it twice), checks it may still go, and sends it from the
 *      being that wrote it, tagged with its meeting, with replies to come back to that meeting;
 *   3. {@link recoverInterruptedSends} — a send interrupted with no answer (a crash, a timeout,
 *      a dropped connection) may or may not have gone out. Once Brevo has had time to record
 *      it, the worker asks Brevo for the letter's tag: sent, or back in the queue.
 *
 * `COUNCIL_LETTERS` decides what sending means: `off` queues and sends nothing, `test` sends
 * every letter to our own inbox, `live` to its recipient.
 */

export type LettersMode = "off" | "test" | "live";

/** Longer than any letter should be: the letter, words set apart and the footer are ~2,000 characters. */
const MAX_LETTER_LENGTH = 6000;
const MIN_BODY_LENGTH = 40;
/** Most letters sent on one tick, so a backlog drains steadily rather than at once. */
const LETTERS_PER_TICK = 10;
/** How long after its claim an unanswered send is looked up in Brevo — well past the send timeout. */
const INTERRUPTED_AFTER_MS = 10 * 60 * 1000;
/** How long an interrupted send may stay unresolved (Brevo cannot be asked) before it is reported. */
const REPORT_STUCK_AFTER_MS = 60 * 60 * 1000;
/** Temporary Brevo errors (5xx, 429) a letter is sent again after, before it counts as failed. */
const MAX_ATTEMPTS = 3;

export interface OutboxDeps {
    meetings: Collection<StoredMeeting>;
    letters: Collection<OutboxLetter>;
    blocklist: Collection<BlockedRecipient>;
    options: Pick<GlobalOptions, "letterSiteUrl" | "letterSenderDomain" | "letterReplyDomain" | "letterSenderAddresses" | "letterDailyLimit">;
    loadRecipients: () => Promise<Recipient[]>;
    send: (email: Email) => Promise<string | null>;
    /** Brevo's message id for an email sent with this tag, or null when it sent none; throws when it cannot be asked. */
    findSent: (tag: string) => Promise<string | null>;
    mode: LettersMode;
    /** Where every letter goes in `test` mode. */
    testTo?: string;
    now?: () => Date;
}

/* -------------------------------------------------------------------------- */
/* Composing                                                                  */
/* -------------------------------------------------------------------------- */

function localPart(options: OutboxDeps["options"], authorId: string): string {
    return options.letterSenderAddresses[authorId] ?? authorId;
}

/** `Renen <reindeer@council-of-forest.com>`: the being, by its name in the meeting's language. */
export function letterSender(options: OutboxDeps["options"], authorId: string, authorName: string): { name: string; email: string } {
    return { name: authorName, email: `${localPart(options, authorId)}@${options.letterSenderDomain}` };
}

/** The Brevo tag a letter is sent with, to find it again: one per meeting. */
export function letterTag(meetingId: number): string {
    return `letter-${meetingId}`;
}

/**
 * `reindeer.1400.9f3ac2e1@reply.council-of-forest.com`: a reply tells us which being and which
 * meeting it answers, and the letter's own token that it really is a reply to that letter.
 */
export function letterReplyTo(options: OutboxDeps["options"], authorId: string, meetingId: number, token: string): string {
    return `${localPart(options, authorId)}.${meetingId}.${token}@${options.letterReplyDomain}`;
}

/** The finished letter of a meeting as an outbox record, or null when it is not one to send. */
export function composeOutboxLetter(
    meeting: StoredMeeting,
    recipient: Recipient,
    options: OutboxDeps["options"],
    now: Date,
): OutboxLetter | null {
    const letter = meeting.letter;
    if (!letter?.send || !letter.finishedAt || !recipient.email) return null;
    const author = meeting.characters.find((character) => character.id === letter.authorId);
    const replyToken = randomBytes(4).toString("hex");
    return {
        _id: meeting._id,
        status: "queued",
        recipientId: recipient.id,
        recipientKind: recipient.kind,
        to: recipient.email,
        from: letterSender(options, letter.authorId, author?.name ?? letter.authorId),
        replyTo: letterReplyTo(options, letter.authorId, meeting._id, replyToken),
        replyToken,
        subject: letter.subject ?? "",
        text: [letter.body, letter.humanNote, letter.footer].filter(Boolean).join("\n\n"),
        ...(meeting.venueId ? { venueId: meeting.venueId } : {}),
        queuedAt: now,
    };
}

const EMAIL_ADDRESS = /[\p{L}\d._%+-]+@[\p{L}\d.-]+\.\p{L}{2,}/gu;
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>()]+/gi;
/** The collective's own site, which the footer names besides the meeting. */
const MAKER_SITE = "nonhuman-nonsense.com";

/**
 * The last look before a letter goes to a real person: nothing a model could have got badly
 * wrong. Returns why it may not go, or null. An address or a link that is not ours is refused —
 * a letter has no reason to point anywhere but the meeting and the collective that made it.
 */
export function checkOutboxLetter(letter: OutboxLetter, options: OutboxDeps["options"]): string | null {
    const body = letter.text.split("\n\n—")[0] ?? "";
    if (!letter.subject.trim()) return "the letter has no subject";
    if (body.trim().length < MIN_BODY_LENGTH) return "the letter is empty";
    if (letter.text.length > MAX_LETTER_LENGTH) return `the letter is ${letter.text.length} characters long`;

    const ownDomains = [options.letterSenderDomain, options.letterReplyDomain].map((domain) => domain.toLowerCase());
    const foreignAddress = (letter.text.match(EMAIL_ADDRESS) ?? [])
        .find((address) => !ownDomains.includes(address.split("@")[1].toLowerCase()));
    if (foreignAddress) return `the letter contains an email address: ${foreignAddress}`;

    const site = new URL(options.letterSiteUrl).host.toLowerCase();
    const foreignLink = (letter.text.match(LINK) ?? []).find((link) => {
        const host = (() => {
            try { return new URL(link.startsWith("www.") ? `https://${link}` : link).host.toLowerCase(); } catch { return ""; }
        })();
        return ![site, MAKER_SITE].some((own) => host === own || host === `www.${own}`);
    });
    if (foreignLink) return `the letter contains a link: ${foreignLink}`;
    return null;
}

/* -------------------------------------------------------------------------- */
/* Queueing                                                                   */
/* -------------------------------------------------------------------------- */

function isDuplicateKey(error: unknown): boolean {
    return (error as { code?: number })?.code === 11000;
}

/**
 * Puts every finished letter marked to send, and not yet in the outbox, into it — as `queued`,
 * or `refused` with the reason when the last check fails (refusals are reported). Returns how
 * many it added.
 */
export async function queueFinishedLetters(deps: OutboxDeps): Promise<number> {
    const now = deps.now?.() ?? new Date();
    const finished = await deps.meetings
        .find({ "letter.send": true, "letter.finishedAt": { $exists: true } }, { projection: { _id: 1 } })
        .toArray();
    if (finished.length === 0) return 0;
    const queued = new Set(await deps.letters.distinct("_id", { _id: { $in: finished.map((meeting) => meeting._id) } }));
    const missing = finished.filter((meeting) => !queued.has(meeting._id));
    if (missing.length === 0) return 0;

    const recipients = await deps.loadRecipients();
    let added = 0;
    for (const { _id } of missing) {
        const meeting = await deps.meetings.findOne({ _id });
        const recipient = recipients.find((candidate) => candidate.id === meeting?.letter?.recipientId);
        if (!meeting || !recipient) {
            await Logger.error("letters", `letter of meeting ${_id} cannot be queued: its recipient ${meeting?.letter?.recipientId} is not on the list`);
            continue;
        }
        const letter = composeOutboxLetter(meeting, recipient, deps.options, now);
        if (!letter) continue;
        const refusal = checkOutboxLetter(letter, deps.options);
        try {
            await deps.letters.insertOne(refusal ? { ...letter, status: "refused", reason: refusal } : letter);
            added++;
        } catch (error) {
            if (isDuplicateKey(error)) continue; // queued meanwhile by another worker
            throw error;
        }
        if (refusal) await Logger.error("letters", `letter of meeting ${_id} to ${recipient.id} refused: ${refusal}`);
        else Logger.info("letters", `letter of meeting ${_id} to ${recipient.id} queued`);
    }
    return added;
}

/* -------------------------------------------------------------------------- */
/* Sending                                                                    */
/* -------------------------------------------------------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000;

export type SendResult = "off" | "empty" | "ceiling" | "sent" | "skipped" | "failed";

/** Why a claimed letter may no longer go: its recipient opted out or bounced, or a person already had theirs. */
async function reasonNotToSend(deps: OutboxDeps, letter: OutboxLetter): Promise<string | null> {
    if (await deps.blocklist.findOne({ _id: letter.recipientId })) return "the recipient is on the blocklist";
    if (letter.recipientKind === "person" && deps.mode === "live") {
        const earlier = await deps.letters.findOne({ recipientId: letter.recipientId, status: "sent", mode: "live", _id: { $ne: letter._id } });
        if (earlier) return `the recipient already received the letter of meeting ${earlier._id}`;
    }
    return null;
}

let lastCeilingReport = 0;

/**
 * Sends the oldest queued letter, if sending is on and the daily ceiling is not reached.
 * Every outcome is written to the letter; failures and the ceiling are reported.
 */
export async function sendNextLetter(deps: OutboxDeps): Promise<SendResult> {
    if (deps.mode === "off") return "off";
    const now = deps.now?.() ?? new Date();

    const sentToday = await deps.letters.countDocuments({ status: "sent", sentAt: { $gte: new Date(now.getTime() - DAY_MS) } });
    if (sentToday >= deps.options.letterDailyLimit) {
        if (now.getTime() - lastCeilingReport > DAY_MS && await deps.letters.findOne({ status: "queued" })) {
            lastCeilingReport = now.getTime();
            await Logger.error("letters", `${sentToday} letters sent in 24 hours, the ceiling (letterDailyLimit); the rest wait in the outbox`);
        }
        return "ceiling";
    }

    const letter = await deps.letters.findOneAndUpdate(
        { status: "queued" },
        { $set: { status: "sending", claimedAt: now, mode: deps.mode } },
        { sort: { queuedAt: 1 }, returnDocument: "after" },
    );
    if (!letter) return "empty";

    const notToSend = await reasonNotToSend(deps, letter);
    if (notToSend) {
        await deps.letters.updateOne({ _id: letter._id }, { $set: { status: "skipped", reason: notToSend } });
        Logger.info("letters", `letter of meeting ${letter._id} not sent: ${notToSend}`);
        return "skipped";
    }

    const test = deps.mode === "test";
    try {
        const messageId = await deps.send({
            to: [test ? deps.testTo! : letter.to],
            subject: test ? `[test → ${letter.recipientId} <${letter.to}>] ${letter.subject}` : letter.subject,
            text: letter.text,
            sender: letter.from,
            replyTo: letter.replyTo,
            tags: [letterTag(letter._id)],
        });
        await deps.letters.updateOne(
            { _id: letter._id },
            { $set: { status: "sent", sentAt: deps.now?.() ?? new Date(), ...(messageId ? { brevoMessageId: messageId } : {}) } },
        );
        Logger.info("letters", `letter of meeting ${letter._id} sent (${deps.mode}) to ${test ? deps.testTo : letter.to}`);
        return "sent";
    } catch (error) {
        if (!(error instanceof BrevoRefusedError)) {
            // No answer: it may have gone out. Left `sending`, to be looked up in Brevo.
            Logger.warn("letters", `letter of meeting ${letter._id}: no answer from Brevo (${(error as Error).message}); will check whether it was sent`);
            return "failed";
        }
        const reason = error.message;
        const attempts = (letter.attempts ?? 0) + 1;
        if ((error.status === 429 || error.status >= 500) && attempts < MAX_ATTEMPTS) {
            await deps.letters.updateOne({ _id: letter._id }, { $set: { status: "queued", attempts, reason }, $unset: { claimedAt: "", mode: "" } });
            Logger.warn("letters", `letter of meeting ${letter._id}: Brevo busy (${error.status}), back in the queue`);
            return "failed";
        }
        await deps.letters.updateOne({ _id: letter._id }, { $set: { status: "failed", attempts, reason } });
        await Logger.error("letters", `letter of meeting ${letter._id} to ${letter.recipientId} failed`, { error });
        return "failed";
    }
}

/**
 * Resolves sends interrupted with no answer from Brevo, once it has had time to record them:
 * sent (Brevo has the letter's tag), or back in the queue. Brevo that cannot be asked is tried
 * again on the next turn, and reported if that goes on.
 */
export async function recoverInterruptedSends(deps: OutboxDeps): Promise<void> {
    const now = deps.now?.() ?? new Date();
    const interrupted = await deps.letters
        .find({ status: "sending", claimedAt: { $lt: new Date(now.getTime() - INTERRUPTED_AFTER_MS) } })
        .toArray();
    for (const letter of interrupted) {
        let messageId: string | null;
        try {
            messageId = await deps.findSent(letterTag(letter._id));
        } catch (error) {
            const since = now.getTime() - (letter.claimedAt?.getTime() ?? now.getTime());
            if (since > REPORT_STUCK_AFTER_MS && !letter.reportedStuck) {
                await deps.letters.updateOne({ _id: letter._id }, { $set: { reportedStuck: true } });
                await Logger.error("letters", `cannot ask Brevo whether the letter of meeting ${letter._id} was sent; it waits`, { error });
            }
            continue;
        }
        if (messageId) {
            await deps.letters.updateOne(
                { _id: letter._id, status: "sending" },
                { $set: { status: "sent", sentAt: letter.claimedAt, brevoMessageId: messageId } },
            );
            Logger.info("letters", `interrupted send of meeting ${letter._id}: Brevo sent it`);
        } else {
            await deps.letters.updateOne(
                { _id: letter._id, status: "sending" },
                { $set: { status: "queued" }, $unset: { claimedAt: "", mode: "" } },
            );
            Logger.info("letters", `interrupted send of meeting ${letter._id}: not sent, back in the queue`);
        }
    }
}

/** One turn of the worker: queue what is finished, settle interrupted sends, then send what may go, a few at a time. */
export async function runOutbox(deps: OutboxDeps): Promise<void> {
    await queueFinishedLetters(deps);
    if (deps.mode !== "off") await recoverInterruptedSends(deps);
    for (let i = 0; i < LETTERS_PER_TICK; i++) {
        const result = await sendNextLetter(deps);
        if (result !== "sent" && result !== "skipped" && result !== "failed") return;
    }
}
