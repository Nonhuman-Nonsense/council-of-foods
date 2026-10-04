import type { Audio, BaseMeeting } from '@shared/ModelTypes.js';
import type { UsageEvent } from '@shared/UsageTypes.js';
import type { Document } from "mongodb";
import type { LetterForm } from '@logic/letters/prompts/letterPrompts.js';
import type { HumanHandling } from '@logic/letters/prompts/humanSorting.js';

// Re-using local interfaces or defining them here if they need to be shared broadly
// For now, we import what we can.

// Additional fields for the stored meeting, never sent to the client
export interface StoredMeeting extends BaseMeeting, Document {
    liveKey: string;
    /** Venue the meeting ran at, if staff chose one. Tags the meeting's AI usage. */
    venueId?: string;
    /** Whether this meeting's letter may go out by email: an installation's yes, the web's no. */
    sendsLetters?: boolean;
    /** The letter a meeting ending in one is writing, then wrote. See docs/council-letters.md. */
    letter?: MeetingLetter;
}

/**
 * The letter as it is written, saved step by step so a reconnect resumes where it stopped: the
 * author when the closing line is said, the plan with the announcement, the draft when ready,
 * the human's answer when given, and everything else once finished. Earlier letters are read
 * back for what the next one should not repeat, and for who has already received one.
 */
export interface MeetingLetter {
    authorId: string;
    recipientId?: string;
    points?: string[];
    form?: LetterForm;
    asksReply?: boolean;
    draft?: { subject: string; body: string };
    /** Whether the human answered when asked to add something (false: skipped or walked away). */
    present?: boolean;
    /** What they said, as they said it. */
    addition?: string;
    /** Set once the letter is finished. */
    finishedAt?: string;
    subject?: string;
    body?: string;
    humanNote?: string | null;
    footer?: string;
    handling?: HumanHandling | "none";
    humanContributed?: boolean;
    send?: boolean;
    sendReason?: string | null;
}

/**
 * A letter on its way out (docs/council-letters.md → Outbox): one per meeting, so a letter can
 * never be queued twice. The worker claims it (`sending`) before calling Brevo, so a crash can
 * lose a letter but never send it twice.
 */
export interface OutboxLetter extends Document {
    /** The meeting the letter ends. */
    _id: number;
    status: "queued" | "sending" | "sent" | "failed" | "refused" | "skipped";
    /** Why a letter was refused (the mechanical check), skipped (its recipient may no longer be written to) or failed. */
    reason?: string;
    recipientId: string;
    recipientKind: "institution" | "person";
    to: string;
    from: { name: string; email: string };
    replyTo: string;
    subject: string;
    /** The letter, any words set apart, and the footer. */
    text: string;
    venueId?: string;
    queuedAt: Date;
    claimedAt?: Date;
    sentAt?: Date;
    /** Sends Brevo answered with a temporary error (5xx, 429); the letter goes back in the queue until a few have. */
    attempts?: number;
    /** Set once a long-unresolved interrupted send has been reported, so it is reported once. */
    reportedStuck?: boolean;
    /** The sending mode it went out in: only `live` letters reached their recipient. */
    mode?: "test" | "live";
    brevoMessageId?: string;
}

/**
 * An email that came back to a letter's reply address (docs/council-letters.md → Receiving).
 * Replies and opt-outs are printed at the letter's venue; automatic replies and spam are kept,
 * never printed.
 */
export interface LetterReply extends Document {
    /** From the email's Message-ID, so Brevo posting it again changes nothing. */
    _id: string;
    meetingId: number;
    recipientId: string;
    venueId?: string;
    /** The letter it answers, as it is printed with the reply. */
    letter: { authorId: string; authorName: string; recipientName: string; subject: string; language: string };
    /** Who wrote back, by name; their address is kept out of anything printed. */
    from: { address: string; name: string | null };
    subject: string;
    /** What they wrote, without the quoted letter, their signature or contact details. */
    message: string;
    receivedAt: Date;
    kind: "reply" | "opt-out" | "automatic" | "spam";
    reason?: string;
    printedAt?: Date;
}

/** A recipient who may not be written to again: they opted out, or their address bounced. */
export interface BlockedRecipient extends Document {
    _id: string;
    reason: "opt-out" | "bounce" | "complaint" | "manual";
    at: Date;
    /** The meeting whose letter it answered, when it came from a reply or a bounce. */
    meetingId?: number;
    note?: string;
}

export interface StoredUsageEvent extends UsageEvent, Document {}

/** Latest reading of one room power plug at one venue; `_id` is `<venueId>|<plug>`. */
export interface StoredRoomPower extends Document {
    _id: string;
    venueId: string;
    plug: number;
    /** The Shelly reporting as this plug number. */
    deviceId: string;
    label: string;
    watts: number;
    /** Accumulated energy since first report, Wh. */
    energyWh: number;
    /** The plug's counter at the last report, to accumulate deltas across its resets. */
    lastCounterWh: number;
    /** The plug's uptime at the last report, to tell a restart (and counter reset) for certain. */
    lastUptimeSeconds?: number;
    /** Energy the last report added, Wh; what that report adds to its hour. */
    lastDeltaWh: number;
    updatedAt: Date;
}

/** One plug's electricity at a venue in one hour (UTC); `_id` is `<venueId>|<plug>|<hour ISO>`. */
export interface StoredRoomPowerHour extends Document {
    _id: string;
    venueId: string;
    plug: number;
    /** The Shelly reporting as this plug number at its latest report in this hour. */
    deviceId: string;
    /** The plug's label at its latest report in this hour. */
    label: string;
    /** Start of the hour. */
    hour: Date;
    /** Energy used in this hour, Wh. */
    energyWh: number;
    maxWatts: number;
    /** Reports received in this hour; few or none means the plug was offline. */
    reports: number;
}

export type SubtitleTimingType = 'whisper' | 'inworld' | 'elevenlabs' | 'estimated' | undefined;
export interface StoredAudio extends Audio, Document {
    subtitleTimingType?: SubtitleTimingType;
}

export interface Counter extends Document {
    _id: string;
    seq: number;
}
