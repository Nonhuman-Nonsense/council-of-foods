import type { Message } from "@shared/ModelTypes.js";
import type { StoredMeeting } from "@models/DBModels.js";

/**
 * A human's stored words open with their name ("Leo said: …", "Leo sa: …") so the screen and
 * the voice can present them; HumanInputHandler writes it with a no-break space.
 */
const SAID_PREFIX = /^[^\n]*? (?:said|sa):\u00a0/;

const isHumanTurn = (message: Message) =>
    message.type === "human" || (message.type === "panelist" && message.speaker.startsWith("panelist"));

/**
 * How a turn of the meeting reads to a model: `Name: words`. A human's or human panelist's turn
 * loses the "said:" its stored text opens with, so it does not read as `Leo: Leo said: …`.
 */
export function turnForModel(message: Message, meeting: StoredMeeting): string {
    if (isHumanTurn(message)) {
        const name = message.type === "human"
            ? (meeting.state?.humanName || message.speaker || "Human")
            : (meeting.characters.find((c) => c.id === message.speaker)?.name ?? message.speaker);
        return `${name}: ${(message.text ?? "").replace(SAID_PREFIX, "")}`;
    }
    const name = meeting.characters.find((c) => c.id === message.speaker)?.name || "Unknown";
    return `${name}: ${message.text}`;
}
