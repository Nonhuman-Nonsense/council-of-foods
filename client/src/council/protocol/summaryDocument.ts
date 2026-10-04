import type { TFunction } from "i18next";
import type { LetterView, Message } from "@shared/ModelTypes";

/**
 * The meeting's summary as the overlay, the PDF and the printer show it: the chair's protocol
 * as written, or — when the meeting ended in a letter (docs/council-letters.md) — the letter
 * laid out as one, in the same markdown the protocol uses.
 */
export function summaryDocument(summary: Message | null | undefined, t: TFunction): string {
    if (!summary || summary.type !== "summary") return "";
    return summary.letter ? letterDocument(summary.letter, t) : summary.text;
}

/** A letter is printed only if the human was there to answer when asked to add something. */
export function isPrintableSummary(summary: Message | null | undefined): boolean {
    return summary?.type === "summary" && (!summary.letter || summary.letter.present);
}

function letterDocument(letter: LetterView, t: TFunction): string {
    const to = letter.recipientOrganisation ? `${letter.recipientName}, ${letter.recipientOrganisation}` : letter.recipientName;
    return [
        `**${t("letter.from")}:** ${letter.authorName}`,
        `**${t("letter.to")}:** ${to}`,
        `**${t("letter.subject")}:** ${letter.subject}`,
        "",
        letter.body,
        ...(letter.humanNote ? ["", letter.humanNote] : []),
        "",
        "---",
        "",
        letter.footer,
        ...(letter.send ? [] : ["", `*${t("letter.unsent")}*`]),
    ].join("\n");
}
