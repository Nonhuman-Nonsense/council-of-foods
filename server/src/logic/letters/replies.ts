import type { Collection } from "mongodb";
import type { BlockedRecipient, LetterReply, OutboxLetter, StoredMeeting } from "@models/DBModels.js";
import type { GlobalOptions } from "@logic/GlobalOptions.js";
import type { Recipient } from "./recipients.js";
import { createHash } from "node:crypto";
import { requestSpeakerClassifierCompletion } from "@logic/SpeakerClassifierBase.js";
import { Logger } from "@utils/Logger.js";
import { withoutContactDetails } from "./LetterWriter.js";
import { REPLY_KINDS, replySortingPrompt, type ReplyKind } from "./prompts/replySorting.js";

/**
 * What comes back to the letters (docs/council-letters.md → Receiving).
 *
 * Replies arrive from Brevo's inbound parsing: every email to `<being>.<meeting>@<reply domain>`
 * is posted to the server already split into the message, the signature and the quoted letter.
 * {@link receiveReplies} finds the letter it answers, sorts it — a reply, an opt-out, an automatic
 * reply, spam — and keeps it; an opt-out puts the recipient on the blocklist. Replies and opt-outs
 * are printed at the letter's venue (the installation endpoints in api/letterRoutes.ts).
 *
 * Delivery events arrive from Brevo's transactional webhook: {@link receiveDeliveryEvents} puts
 * a recipient whose address bounced, or who marked a letter as spam, on the blocklist.
 */

/** Brevo's own spam score (rspamd) at which a reply is spam: rspamd marks mail as spam from 6. */
const SPAM_SCORE = 6;
const SORTING_MAX_TOKENS = 80;

export interface ReplyDeps {
    meetings: Collection<StoredMeeting>;
    letters: Collection<OutboxLetter>;
    replies: Collection<LetterReply>;
    blocklist: Collection<BlockedRecipient>;
    options: GlobalOptions;
    loadRecipients: () => Promise<Recipient[]>;
    /** Sorts what a person may have written; the default asks the classifier model. */
    classify?: (meeting: StoredMeeting, text: string) => Promise<{ kind: ReplyKind; reason: string }>;
    now?: () => Date;
}

/** A mailbox as Brevo posts it. */
type Mailbox = { Address?: string; Name?: string | null } | string;

/** One email as Brevo's inbound parsing posts it (the fields used here). */
export interface InboundEmail {
    MessageId?: string;
    Uuid?: string[];
    From?: Mailbox;
    To?: Mailbox[];
    Recipients?: Mailbox[];
    Cc?: Mailbox[];
    Subject?: string;
    RawTextBody?: string | null;
    ExtractedMarkdownMessage?: string | null;
    SpamScore?: number;
    Headers?: Record<string, string | string[]> | string;
}

const addressOf = (mailbox: Mailbox | undefined): string =>
    (typeof mailbox === "string" ? mailbox : mailbox?.Address ?? "").trim().toLowerCase();
const nameOf = (mailbox: Mailbox | undefined): string | null =>
    typeof mailbox === "string" ? null : mailbox?.Name?.trim() || null;

/**
 * `tree.harvester.1400.9f3ac2e1@reply.council-of-forest.com` → meeting 1400, token 9f3ac2e1;
 * null for anything else. (Letters sent before tokens have none.)
 */
export function parseReplyAddress(address: string, replyDomain: string): { meetingId: number; token: string | null } | null {
    const [local, domain] = address.trim().toLowerCase().split("@");
    if (!local || domain !== replyDomain.toLowerCase()) return null;
    const match = /\.(\d{1,12})(?:\.([a-f0-9]{8}))?$/.exec(local);
    return match ? { meetingId: Number(match[1]), token: match[2] ?? null } : null;
}

function headerValues(headers: InboundEmail["Headers"], name: string): string[] {
    if (!headers) return [];
    if (typeof headers === "string") {
        const pattern = new RegExp(`^${name}:\\s*(.*)$`, "gim");
        return [...headers.matchAll(pattern)].map((match) => match[1].trim());
    }
    const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    const value = key ? headers[key] : undefined;
    return value === undefined ? [] : (Array.isArray(value) ? value : [value]);
}

const AUTOMATIC_SUBJECT =
    /^\s*(auto(matic|matiskt)?[ -]?(reply|svar|response)|autosvar|out of (the )?office|fr[åa]nvaro(meddelande)?|abwesenheit|auto:|delivery status notification|undeliverable|olevererbar|mail delivery)/i;

/** An automatic reply, as its headers or subject announce it — no model needed. */
export function isAutomaticReply(email: InboundEmail): boolean {
    const autoSubmitted = headerValues(email.Headers, "Auto-Submitted").some((value) => value.toLowerCase() !== "no");
    const autoHeader = ["X-Autoreply", "X-Autorespond", "X-Autoresponder"].some((name) => headerValues(email.Headers, name).length > 0);
    const precedence = headerValues(email.Headers, "Precedence").some((value) => /auto_reply|bulk|junk|list/i.test(value));
    const daemon = /^(mailer-daemon|postmaster)@/i.test(addressOf(email.From));
    return autoSubmitted || autoHeader || precedence || daemon || AUTOMATIC_SUBJECT.test(email.Subject ?? "");
}

/** The message as written: Brevo's extraction, else the plain text without what it quotes. */
function messageOf(email: InboundEmail): string {
    const extracted = email.ExtractedMarkdownMessage?.trim();
    if (extracted) return extracted;
    const lines = (email.RawTextBody ?? "").split("\n");
    const quoteStart = lines.findIndex((line) => /^>/.test(line) || /^(On|Den) .+ (wrote|skrev):\s*$/i.test(line.trim()));
    return (quoteStart === -1 ? lines : lines.slice(0, quoteStart)).join("\n").trim();
}

function replyId(email: InboundEmail): string {
    const source = email.MessageId || email.Uuid?.[0] || `${addressOf(email.From)}|${email.Subject}|${messageOf(email)}`;
    return createHash("sha256").update(source).digest("hex").slice(0, 24);
}

/** Reads "reply: reason". Anything unreadable is a reply: what a person wrote is never dropped for it. */
export function parseReplyKind(raw: string): { kind: ReplyKind; reason: string } {
    const cleaned = raw.replace(/[`*"]/g, "").trim();
    const word = cleaned.match(/^[\p{L}-]+/u)?.[0]?.toLowerCase();
    const kind = (REPLY_KINDS as readonly string[]).includes(word ?? "") ? (word as ReplyKind) : "reply";
    const colon = cleaned.indexOf(":");
    return { kind, reason: colon === -1 ? "" : cleaned.slice(colon + 1).trim() };
}

async function classifyWithModel(options: GlobalOptions, meeting: StoredMeeting, text: string): Promise<{ kind: ReplyKind; reason: string }> {
    const raw = await requestSpeakerClassifierCompletion(
        options,
        [{ role: "system", content: replySortingPrompt() }, { role: "user", content: text }],
        SORTING_MAX_TOKENS,
        "letters.sortReply",
        meeting,
    );
    return parseReplyKind(raw);
}

/**
 * Keeps every email in Brevo's inbound post that answers one of our letters, sorted, and puts
 * opt-outs on the blocklist. An email to no letter of ours is logged and dropped; one posted
 * again is ignored. Returns how many were kept.
 */
export async function receiveReplies(deps: ReplyDeps, emails: InboundEmail[]): Promise<number> {
    let kept = 0;
    for (const email of emails) {
        const addresses = [...(email.Recipients ?? []), ...(email.To ?? []), ...(email.Cc ?? [])].map(addressOf);
        const replyAddress = addresses.map((address) => parseReplyAddress(address, deps.options.letterReplyDomain)).find((parsed) => parsed !== null) ?? null;
        const letter = replyAddress === null ? null : await deps.letters.findOne({ _id: replyAddress.meetingId });
        const meeting = letter === null ? null : await deps.meetings.findOne({ _id: letter._id });
        // Only the address the letter gave out: a guessed one (no token, or the wrong one) is not a reply.
        if (!letter || !meeting?.letter || (letter.replyToken ?? null) !== (replyAddress?.token ?? null)) {
            Logger.warn("letters", `an email to ${addresses.join(", ")} answers no letter of ours; dropped`);
            continue;
        }

        const _id = replyId(email);
        if (await deps.replies.findOne({ _id }, { projection: { _id: 1 } })) continue;

        const message = withoutContactDetails(messageOf(email));
        const subject = email.Subject?.trim() ?? "";
        const sorted = (email.SpamScore ?? 0) >= SPAM_SCORE
            ? { kind: "spam" as const, reason: `spam score ${email.SpamScore}` }
            : isAutomaticReply(email)
                ? { kind: "automatic" as const, reason: "its headers or subject" }
                : await (deps.classify ?? ((m, text) => classifyWithModel(deps.options, m, text)))(meeting, `Subject: ${subject}\n\n${message}`);

        const author = meeting.characters.find((character) => character.id === meeting.letter!.authorId);
        const recipient = (await deps.loadRecipients()).find((candidate) => candidate.id === letter.recipientId);
        const reply: LetterReply = {
            _id,
            meetingId: letter._id,
            recipientId: letter.recipientId,
            ...(letter.venueId ? { venueId: letter.venueId } : {}),
            letter: {
                authorId: meeting.letter.authorId,
                authorName: author?.name ?? meeting.letter.authorId,
                recipientName: recipient?.name ?? letter.recipientId,
                subject: letter.subject,
                language: meeting.language,
            },
            from: { address: addressOf(email.From), name: nameOf(email.From) },
            subject,
            message,
            receivedAt: deps.now?.() ?? new Date(),
            kind: sorted.kind,
            reason: sorted.reason,
        };
        try {
            await deps.replies.insertOne(reply);
        } catch (error) {
            if ((error as { code?: number })?.code === 11000) continue; // the same email, posted twice at once
            throw error;
        }
        kept++;
        Logger.info("letters", `${reply.kind} to the letter of meeting ${letter._id} from ${reply.from.address}`);

        if (reply.kind === "opt-out") {
            await block(deps.blocklist, letter.recipientId, "opt-out", letter._id, sorted.reason);
        }
    }
    return kept;
}

async function block(
    blocklist: Collection<BlockedRecipient>,
    recipientId: string,
    reason: BlockedRecipient["reason"],
    meetingId: number,
    note?: string,
): Promise<void> {
    // The first reason stays: someone who opted out and later bounced opted out.
    await blocklist.updateOne(
        { _id: recipientId },
        { $setOnInsert: { reason, at: new Date(), meetingId, ...(note ? { note } : {}) } },
        { upsert: true },
    );
    Logger.info("letters", `${recipientId} is on the blocklist (${reason})`);
}

/** One event as Brevo's transactional webhook posts it (the fields used here). */
export interface DeliveryEvent {
    event?: string;
    email?: string;
    "message-id"?: string;
    tags?: string[];
    tag?: string;
    reason?: string;
}

/** Brevo events that mean: do not write to this recipient again. */
const BLOCKING_EVENTS: Record<string, BlockedRecipient["reason"]> = {
    hard_bounce: "bounce",
    invalid_email: "bounce",
    blocked: "bounce",
    spam: "complaint",
    unsubscribed: "opt-out",
};

/**
 * Puts the recipient of a letter that bounced, or that was marked as spam, on the blocklist.
 * Other events (delivered, opened, a soft bounce) change nothing. Only letters sent live count:
 * a test letter bouncing says nothing about its recipient.
 */
export async function receiveDeliveryEvents(deps: Pick<ReplyDeps, "letters" | "blocklist">, events: DeliveryEvent[]): Promise<number> {
    let blocked = 0;
    for (const event of events) {
        const reason = BLOCKING_EVENTS[event.event ?? ""];
        if (!reason) continue;
        const tags = [...(event.tags ?? []), ...(event.tag ? [event.tag] : [])];
        const meetingId = tags.map((tag) => /^letter-(\d+)$/.exec(tag)?.[1]).find(Boolean);
        const messageId = event["message-id"]?.replace(/^<|>$/g, "");
        const letter = meetingId
            ? await deps.letters.findOne({ _id: Number(meetingId) })
            : messageId
                ? await deps.letters.findOne({ brevoMessageId: { $in: [messageId, `<${messageId}>`] } })
                : null;
        if (!letter || letter.mode !== "live") continue;
        // The account's webhook reports every email it sends: only the letter's own recipient counts.
        if (event.email && event.email.trim().toLowerCase() !== letter.to.toLowerCase()) continue;
        await block(deps.blocklist, letter.recipientId, reason, letter._id, `${event.event}${event.reason ? `: ${event.reason}` : ""}`);
        blocked++;
    }
    return blocked;
}

/** Replies and opt-outs not yet printed, for one venue — and those whose letter had no venue. */
export async function repliesToPrint(replies: Collection<LetterReply>, venueId: string): Promise<LetterReply[]> {
    return replies
        .find(
            { kind: { $in: ["reply", "opt-out"] }, printedAt: { $exists: false }, $or: [{ venueId }, { venueId: { $exists: false } }] },
            { sort: { receivedAt: 1 }, limit: 20 },
        )
        .toArray();
}

export async function markReplyPrinted(replies: Collection<LetterReply>, id: string, now = new Date()): Promise<boolean> {
    const result = await replies.updateOne({ _id: id, printedAt: { $exists: false } }, { $set: { printedAt: now } });
    return result.matchedCount > 0 || (await replies.countDocuments({ _id: id })) > 0;
}
