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
};

export type Sender = { name: string; email: string };

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
    if (config.COUNCIL_BRIDGE_KEY && config.COUNCIL_VENUES?.length) {
        console.log(`[init] Bridge alerts for venues: ${config.COUNCIL_VENUES.map((venue) => venue.id).join(", ")}`);
    }
}

export async function sendEmail(email: Email): Promise<void> {
    const apiKey = config.COUNCIL_BREVO_API_KEY;
    if (!apiKey || !config.COUNCIL_MAIL_FROM) throw new MailNotConfiguredError();

    const response = await fetch(BREVO_SEND_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "api-key": apiKey,
        },
        body: JSON.stringify({
            sender: getSender(),
            to: email.to.map((address) => ({ email: address })),
            subject: email.subject,
            textContent: email.text,
            ...(email.attachments?.length ? { attachment: email.attachments } : {}),
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`Brevo refused email (${response.status}): ${detail.slice(0, 500)}`);
    }
}
