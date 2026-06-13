import type { Message } from "@shared/ModelTypes.js";
import type { StoredMeeting } from "@models/DBModels.js";
import type { GlobalOptions } from "@logic/GlobalOptions.js";
import type { SpeakerTargetClassifier } from "@logic/SpeakerTargetClassifier.js";

const DIRECTED_MESSAGE_TYPES = new Set(["message", "response", "panelist"]);

export async function annotateDirectedHandoff(
    classifier: SpeakerTargetClassifier,
    serverOptions: GlobalOptions,
    meeting: StoredMeeting,
    message: Message
): Promise<void> {
    if (!serverOptions.directedSpeakerRouting) return;
    if (!DIRECTED_MESSAGE_TYPES.has(message.type)) return;

    const text = "text" in message ? message.text : undefined;
    const speakerId = "speaker" in message ? message.speaker : undefined;
    if (typeof text !== "string" || text.trim().length === 0 || typeof speakerId !== "string") return;

    const targetId = await classifier.inferTarget(meeting, {
        mode: "participantHandoff",
        text,
        speakerId,
    });

    if (targetId) {
        (message as Message & { askParticular?: string }).askParticular = targetId;
    }
}
