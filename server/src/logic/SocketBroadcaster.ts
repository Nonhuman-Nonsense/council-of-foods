import type { Socket } from "socket.io";
import type { IMeetingBroadcaster } from "@interfaces/MeetingInterfaces.js";
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

    broadcastError(message: string, code: number): void {
        this.socket.emit("conversation_error", { message, code });
    }

    broadcastWarning(message: string, code: number, _error?: Error): void {
        this.socket.emit("conversation_error", { message, code });
    }
}
