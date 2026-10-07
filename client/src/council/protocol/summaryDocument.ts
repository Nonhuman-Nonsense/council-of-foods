import type { TFunction } from "i18next";
import type { LetterView, Message } from "@shared/ModelTypes";

/**
 * The meeting's summary as the overlay, the PDF and the printer show it: the chair's protocol
 * as written, or — when the meeting ended in a letter (docs/council-letters.md) — the letter
 * laid out as one, in the same markdown the protocol uses. On paper a letter is only the letter:
 * `footer: false` leaves out the email's footer and the note that it was not sent.
 */
export function summaryDocument(
    summary: Message | null | undefined,
    t: TFunction,
    { footer = true }: { footer?: boolean } = {},
): string {
    if (!summary || summary.type !== "summary") return "";
    return summary.letter ? letterDocument(summary.letter, t, footer) : summary.text;
}

/** Whether the meeting ended in a letter rather than a protocol. */
export function isLetterSummary(summary: Message | null | undefined): boolean {
    return summary?.type === "summary" && Boolean(summary.letter);
}

/** A letter is printed only if the human was there to answer when asked to add something. */
export function isPrintableSummary(summary: Message | null | undefined): boolean {
    return summary?.type === "summary" && (!summary.letter || summary.letter.present);
}

function letterDocument(letter: LetterView, t: TFunction, footer: boolean): string {
    const to = letter.recipientOrganisation ? `${letter.recipientName}, ${letter.recipientOrganisation}` : letter.recipientName;
    return [
        `**${t("letter.from")}:** ${letter.authorName}`,
        `**${t("letter.to")}:** ${to}`,
        `**${t("letter.subject")}:** ${letter.subject}`,
        "",
        letter.body,
        ...(letter.humanNote ? ["", letter.humanNote] : []),
        ...(footer ? ["", "---", "", letter.footer] : []),
        ...(footer && !letter.send ? ["", `*${t("letter.unsent")}*`] : []),
    ].join("\n");
}
