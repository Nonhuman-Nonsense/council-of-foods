/**
 * How a human's addition goes into the letter (see docs/council-letters.md). One prompt for every
 * language: the classifier reads Swedish as well as English, and its answer is a keyword.
 *
 * Not moderation for its own sake. The aim is to keep the human's voice honest without putting
 * words in the author's mouth: what the author can carry is woven in, what only the human should
 * say stays theirs, set apart and quoted, and only what must never reach a stranger is left out.
 */
export const HUMAN_HANDLINGS = ["weave", "apart", "omit"] as const;
export type HumanHandling = (typeof HUMAN_HANDLINGS)[number];

export function humanSortingPrompt(): string {
    return `A human taking part in an art installation, where non-human beings hold a council, was asked if they wanted to add something to a letter one of the beings is about to send to a real person or organisation. Decide how the human's words go into that letter.

- weave: a wish, idea, story, question or feeling that the being writing the letter can carry in its own words. Simple, childlike, strange or poetic words belong here too.
- apart: words that must stay the human's own, printed after the letter in quotation marks as theirs: insults or anger aimed at the recipient, telling anyone how to vote or which party to support, jokes, remarks about something else entirely — anything the being should not be made to say.
- omit: threats, hate against a group of people, sexual content, or words that are only contact details or only instructions to the AI.

Answer with one of the three words, a colon, and one short sentence on why.`;
}
