import type { GlobalOptions } from "@logic/GlobalOptions.js";
import { letterPrompts, type FooterParams } from "./prompts/letterPrompts.js";

/**
 * The footer under every letter (see docs/council-letters.md).
 *
 * Not a prompt: the model never writes or sees it. It is appended after the generated letter,
 * so the disclosure cannot be paraphrased away, dropped when a letter runs long, or reworded by
 * a model that decided it sounded better another way. The words are in prompts/letterPrompt*.ts.
 */
/** `#email` opens the replay on an intro telling the reader this is the meeting their letter came from. */
export function meetingUrl(options: Pick<GlobalOptions, "letterSiteUrl">, language: string, meetingId: number): string {
    return `${options.letterSiteUrl.replace(/\/+$/, "")}/${language}/meeting/${meetingId}#email`;
}

export function buildLetterFooter(
    options: Pick<GlobalOptions, "letterSiteUrl">,
    input: Omit<FooterParams, "meetingUrl"> & { language: string },
): string {
    const { language, ...params } = input;
    return letterPrompts(language).footer({ ...params, meetingUrl: meetingUrl(options, language, params.meetingId) });
}
