import { Server, Socket } from "socket.io";
import { IMeetingBroadcaster } from "@interfaces/MeetingInterfaces.js";
import { ConversationMessage } from "@shared/ModelTypes.js";

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

    broadcastConversationEnd(conversation: ConversationMessage[]): void {
        this.socket.emit("conversation_end", conversation);
    }

    broadcastClientKey(data: any): void {
        this.socket.emit("clientkey_response", data);
    }

    broadcastError(message: string, code: number): void {
        this.socket.emit("conversation_error", { message, code });
    }

    broadcastMeetingNotFound(meetingId: string): void {
        this.socket.emit("meeting_not_found", { meeting_id: meetingId });
    }
}
