import type { TFunction } from "i18next";
import type { LetterView, Message } from "@shared/ModelTypes";

/**
 * The text of the meeting's summary: the chair's protocol as written, or — when the meeting
 * ended in a letter (docs/council-letters.md) — the letter's message, whose header
 * `LetterDocument` lays out. On paper a letter is only the letter: `footer: false` leaves out
 * the email's footer and the note that it was not sent.
 */
export function summaryDocument(
    summary: Message | null | undefined,
    t: TFunction,
    { footer = true }: { footer?: boolean } = {},
): string {
    if (!summary || summary.type !== "summary") return "";
    return summary.letter ? letterBody(summary.letter, t, footer) : summary.text;
}

/** The letter the meeting ended in, or null when it ended in a protocol. */
export function summaryLetter(summary: Message | null | undefined): LetterView | null {
    return summary?.type === "summary" ? summary.letter ?? null : null;
}

/** A letter is printed only if the human was there to answer when asked to add something. */
export function isPrintableSummary(summary: Message | null | undefined): boolean {
    return summary?.type === "summary" && (!summary.letter || summary.letter.present);
}

/** A letter's message, with the human's words set apart; `footer: false` is how it goes on paper. */
export function letterBody(letter: LetterView, t: TFunction, footer: boolean): string {
    return [
        letter.body,
        ...(letter.humanNote ? ["", letter.humanNote] : []),
        ...(footer ? ["", letter.footer] : []),
        ...(footer && !letter.send ? ["", `*${t("letter.unsent")}*`] : []),
    ].join("\n");
}
