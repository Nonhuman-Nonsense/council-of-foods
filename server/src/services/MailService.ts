import { config } from "@root/src/config.js";

/**
 * Sends email through Brevo's transactional API. One place for every email the
 * council sends, so printer alerts and (later) protocols share a sender, a key
 * and a failure path.
 */

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
const SEND_TIMEOUT_MS = 15_000;

export type EmailAttachment = {
    name: string;
    /** Base64-encoded file contents. */
    content: string;
};

export type Email = {
    to: string[];
    subject: string;
    text: string;
    attachments?: EmailAttachment[];
    /** Who it is from, when not COUNCIL_MAIL_FROM — a letter comes from the being that wrote it. */
    sender?: Sender;
    replyTo?: string;
    /** Hidden copies. */
    bcc?: string[];
    /** Brevo tags, to find the email again in Brevo's records (see {@link findSentByTag}). */
    tags?: string[];
};

export type Sender = { name: string; email: string };

/**
 * Brevo answered, and refused: the email was not sent. Anything else that goes wrong — a
 * timeout, a dropped connection — leaves it unknown whether it was.
 */
export class BrevoRefusedError extends Error {
    constructor(readonly status: number, detail: string) {
        super(`Brevo refused email (${status}): ${detail.slice(0, 500)}`);
        this.name = "BrevoRefusedError";
    }
}

export class MailNotConfiguredError extends Error {
    constructor() {
        super("Email is not configured (COUNCIL_BREVO_API_KEY and COUNCIL_MAIL_FROM)");
    }
}

/** `Council of Foods <council@council-of-foods.com>` → name and address. */
export function parseSender(from: string): Sender {
    const match = /^\s*(.+?)\s*<([^<>\s]+)>\s*$/.exec(from);
    if (!match) throw new Error(`Invalid sender: ${from}`);
    return { name: match[1], email: match[2] };
}

export function isMailConfigured(): boolean {
    return Boolean(config.COUNCIL_BREVO_API_KEY && config.COUNCIL_MAIL_FROM);
}

/** The sender, whose name ("Council of Foods") also titles the product in emails. */
export function getSender(): Sender {
    if (!config.COUNCIL_MAIL_FROM) throw new MailNotConfiguredError();
    return parseSender(config.COUNCIL_MAIL_FROM);
}

export function initMail(): void {
    if (isMailConfigured()) {
        console.log(`[init] Email via Brevo from ${config.COUNCIL_MAIL_FROM}`);
    } else {
        console.warn("[init] COUNCIL_BREVO_API_KEY or COUNCIL_MAIL_FROM not set, will not send email.");
    }
    if (config.COUNCIL_INSTALLATION_KEY && config.COUNCIL_VENUES?.length) {
        console.log(`[init] Printer alerts for venues: ${config.COUNCIL_VENUES.map((venue) => venue.id).join(", ")}`);
    }
}

/** Sends, and returns Brevo's message id for the email. */
export async function sendEmail(email: Email): Promise<string | null> {
    const apiKey = config.COUNCIL_BREVO_API_KEY;
    if (!apiKey || (!config.COUNCIL_MAIL_FROM && !email.sender)) throw new MailNotConfiguredError();

    const response = await fetch(BREVO_SEND_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "api-key": apiKey,
        },
        body: JSON.stringify({
            sender: email.sender ?? getSender(),
            to: email.to.map((address) => ({ email: address })),
            ...(email.replyTo ? { replyTo: { email: email.replyTo } } : {}),
            ...(email.bcc?.length ? { bcc: email.bcc.map((address) => ({ email: address })) } : {}),
            ...(email.tags?.length ? { tags: email.tags } : {}),
            subject: email.subject,
            textContent: email.text,
            ...(email.attachments?.length ? { attachment: email.attachments } : {}),
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new BrevoRefusedError(response.status, detail);
    }
    const body = await response.json().catch(() => null) as { messageId?: string } | null;
    return body?.messageId ?? null;
}

const BREVO_EVENTS_URL = "https://api.brevo.com/v3/smtp/statistics/events";

/**
 * Whether Brevo sent an email with this tag in the last 30 days: its message id, or null when
 * it has no record of one. Throws when Brevo cannot be asked.
 */
export async function findSentByTag(tag: string): Promise<string | null> {
    const apiKey = config.COUNCIL_BREVO_API_KEY;
    if (!apiKey) throw new MailNotConfiguredError();
    const url = `${BREVO_EVENTS_URL}?${new URLSearchParams({ tags: tag, days: "30", limit: "10" })}`;
    const response = await fetch(url, {
        headers: { Accept: "application/json", "api-key": apiKey },
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Brevo events (${response.status}): ${(await response.text().catch(() => "")).slice(0, 300)}`);
    const body = await response.json() as { events?: Array<{ messageId?: string }> };
    return body.events?.find((event) => event.messageId)?.messageId ?? null;
}
