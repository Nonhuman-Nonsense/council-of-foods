import type { Socket } from "socket.io";
import type { IMeetingBroadcaster } from "@interfaces/MeetingInterfaces.js";
import type { ConversationMessage } from "@shared/ModelTypes.js";

/**
 * Concrete implementation of IMeetingBroadcaster that wraps a specific Socket.
 * Used by handlers to send events to the specific client/session.
 */
export class SocketBroadcaster implements IMeetingBroadcaster {
    private socket: Socket;

    constructor(socket: Socket) {
        this.socket = socket;
    }

    broadcastMeetingStarted(meetingId: number): void {
        this.socket.emit("meeting_started", { meeting_id: meetingId });
    }

    broadcastConversationUpdate(conversation: ConversationMessage[]): void {
        this.socket.emit("conversation_update", conversation);
    }

    broadcastConversationEnd(): void {
        this.socket.emit("conversation_end");
    }

    broadcastAudioUpdate(audio: any): void {
        this.socket.emit("audio_update", audio);
    }

    broadcastClientKey(data: any): void {
        this.socket.emit("clientkey_response", data);
    }

    broadcastError(message: string, code: number): void {
        this.socket.emit("conversation_error", { message, code });
    }

    //TODO: implement on client
    broadcastMeetingNotFound(meetingId: string): void {
        this.socket.emit("meeting_not_found", { meeting_id: meetingId });
    }
}
