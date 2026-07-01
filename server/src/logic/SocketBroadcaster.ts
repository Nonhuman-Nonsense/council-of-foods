import type { Socket } from "socket.io";
import type { IMeetingBroadcaster } from "@interfaces/MeetingInterfaces.js";
import type { CouncilError } from "@models/Errors.js";
import type { Message } from "@shared/ModelTypes.js";
import type { AudioUpdatePayload } from "@shared/SocketTypes.js";

/**
 * Concrete implementation of IMeetingBroadcaster that wraps a specific Socket.
 * Used by handlers to send events to the specific client/session.
 */
export class SocketBroadcaster implements IMeetingBroadcaster {
    private socket: Socket;

    constructor(socket: Socket) {
        this.socket = socket;
    }

    broadcastConversationUpdate(conversation: Message[]): void {
        this.socket.emit("conversation_update", conversation);
    }

    broadcastConversationEnd(): void {
        this.socket.emit("conversation_end");
    }

    broadcastAudioUpdate(audio: AudioUpdatePayload): void {
        this.socket.emit("audio_update", audio);
    }

    // Both methods emit the same event for now. Do not merge them — call sites express intent
    // (terminal error vs recoverable warning) for future policy differences.
    broadcastError(error: CouncilError, context?: string): void {
        this.socket.emit("conversation_error", error.toErrorPayload(context));
    }

    broadcastWarning(error: CouncilError, context?: string): void {
        this.socket.emit("conversation_error", error.toErrorPayload(context));
    }
}
