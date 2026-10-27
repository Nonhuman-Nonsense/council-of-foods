import type { Message } from "@shared/ModelTypes";

/**
 * The three ways the server waits for a human: a question after a raised hand, a human
 * panelist's turn, and the addition to a being's letter at the end of a meeting
 * (docs/council-letters.md). A question and a letter addition both use the `human_input` state
 * and `submit_human_message` / `skip_human_turn`; they differ in what the server does next.
 */
export type HumanTurnMode = "question" | "panelist" | "letter";

const AWAITING_TYPE = {
    question: "awaiting_human_question",
    panelist: "awaiting_human_panelist",
    letter: "awaiting_letter_addition",
} as const satisfies Record<HumanTurnMode, Message["type"]>;

/** The marker the server writes while it waits for this kind of human turn. */
export function awaitingTypeFor(mode: HumanTurnMode): Message["type"] {
    return AWAITING_TYPE[mode];
}

/** Which human turn a message is waiting for, or null when it is not a waiting marker. */
export function humanTurnModeOf(message: Message | undefined): HumanTurnMode | null {
    switch (message?.type) {
        case "awaiting_human_question": return "question";
        case "awaiting_human_panelist": return "panelist";
        case "awaiting_letter_addition": return "letter";
        default: return null;
    }
}

export function councilStateForHumanTurn(mode: HumanTurnMode): "human_input" | "human_panelist" {
    return mode === "panelist" ? "human_panelist" : "human_input";
}
