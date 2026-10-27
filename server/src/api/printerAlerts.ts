import { z } from "zod";
import type { Venue } from "@models/Venues.js";
import type { Email } from "@services/MailService.js";
import { describePrinterReason } from "@shared/printerReasons.js";

/**
 * What an installation bridge reports about its printer, and the email museum
 * staff receive for it. The wording lives here, on the server, so it can change
 * without reinstalling bridges.
 */

export const PrinterAlertBody = z.object({
    venueId: z.string().min(1).max(100),
    /**
     * `problem`: newly needs attention (or the reason changed). `reminder`: still
     * unresolved. `resolved`: working again, for the team only; staff aren't emailed.
     * `test`: sent by staff to check the chain.
     */
    kind: z.enum(["problem", "reminder", "resolved", "test"]),
    /** Normalised CUPS reason (`media-empty`), or `not-printing` / `no-printer` / `stopped`. */
    reason: z.string().max(100).optional(),
    /** When the problem started, ISO 8601. */
    since: z.iso.datetime({ offset: true }).optional(),
    printer: z.string().max(200).nullable().optional(),
    /** Protocols waiting to print. */
    waiting: z.number().int().min(0).max(100_000).optional(),
    /** The installation Mac's host name. */
    host: z.string().max(200).optional(),
});

export type PrinterAlert = z.infer<typeof PrinterAlertBody>;

/** The alerts staff are emailed about. */
export type EmailedPrinterAlert = Omit<PrinterAlert, "kind"> & { kind: Exclude<PrinterAlert["kind"], "resolved"> };

function formatWhen(iso: string, timeZone: string): string {
    return new Intl.DateTimeFormat("en-GB", {
        timeZone,
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    }).format(new Date(iso));
}

export function buildPrinterAlertEmail(product: string, venue: Venue, alert: EmailedPrinterAlert): Email {
    const what = describePrinterReason(alert.reason);
    const printerName = `${product} printer at ${venue.name}`;

    const details: string[] = [];
    if (alert.kind !== "test") {
        details.push(`Problem: ${what}${alert.since ? ` (since ${formatWhen(alert.since, venue.timezone)})` : ""}`);
    }
    if (alert.printer) details.push(`Printer: ${alert.printer}`);
    if (alert.waiting !== undefined && alert.kind !== "test") {
        details.push(`Protocols waiting: ${alert.waiting}. They print by themselves once the printer is fixed.`);
    }
    if (alert.host) details.push(`Mac: ${alert.host}`);

    let subject: string;
    let lead: string;
    switch (alert.kind) {
        case "problem":
            subject = `${printerName}: ${what}`;
            lead = `The ${printerName} needs attention.`;
            break;
        case "reminder":
            subject = `Reminder: ${printerName}: ${what}`;
            lead = `The ${printerName} still needs attention.`;
            break;
        case "test":
            subject = `${printerName}: test alert`;
            lead = `This is a test from the ${printerName}. If the printer needs attention, for example when it runs out of paper, an email like this is sent to this address.`;
            break;
    }

    return {
        to: venue.alertEmails,
        subject,
        text: [lead, "", ...details].join("\n").trimEnd() + "\n",
    };
}
