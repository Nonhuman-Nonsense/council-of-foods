/**
 * What came back to a letter (see docs/council-letters.md → Receiving). One prompt for every
 * language: the classifier reads Swedish as well as English, and its answer is a keyword. Headers
 * and the subject catch most automatic replies before this is asked.
 */
export const REPLY_KINDS = ["reply", "opt-out", "automatic"] as const;
export type ReplyKind = (typeof REPLY_KINDS)[number];

export function replySortingPrompt(): string {
    return `In an art installation where non-human beings hold a council, one of the beings sent a letter by email to a real person or organisation. This is what came back to that letter. Decide what it is.

- reply: anything a person wrote back — an answer, thanks, a question, a refusal, anger, even a single word.
- opt-out: they ask not to receive any more letters (they may say other things as well).
- automatic: not written by a person in answer to this letter — an out-of-office message, an automatic receipt or case number, a delivery notice.

Answer with one of the three words, a colon, and one short sentence on why.`;
}
