import type { Message } from '@shared/ModelTypes';
import { useEffect, useRef, type MutableRefObject } from 'react';
import { io, Socket } from 'socket.io-client';
import {
    ServerToClientEvents,
    ClientToServerEvents,
    AudioUpdatePayload,
    ErrorPayload
} from '@shared/SocketTypes';

export interface UseCouncilSocketProps {
    meetingId: number;
    /** Required to authenticate `start_conversation`; omit until known. */
    creatorKey: string | undefined;
    onAudioUpdate?: (data: AudioUpdatePayload) => void;
    onConversationUpdate?: (data: Message[]) => void;
    onError?: (error: ErrorPayload) => void;
    onConnectionError?: (error: Error) => void;
    onReconnect?: () => void;
}

/**
 * useCouncilSocket Hook
 *
 * Manages the WebSocket connection for the Council meeting.
 * Handles connecting, emitting setup events, and dispatching incoming updates
 * to the provided callback functions.
 */
export const useCouncilSocket = ({
    meetingId,
    creatorKey,
    onAudioUpdate,
    onConversationUpdate,
    onError,
    onConnectionError,
    onReconnect
}: UseCouncilSocketProps): MutableRefObject<Socket<ServerToClientEvents, ClientToServerEvents> | null> => {
    const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);

    useEffect(() => {
        if (!creatorKey) {
            return;
        }

        const socket = io();
        socketRef.current = socket;

        socket.on('connect_error', (err: Error) => {
            console.error(err);
            if (onConnectionError) onConnectionError(err);
        });

        socket.on('disconnect', (reason: string) => {
            console.log(reason);
        });

        socket.io.on("reconnect", () => {
            if (onReconnect) onReconnect();
        });

        socket.emit("start_conversation", { meetingId, creatorKey });

        socket.on("audio_update", (audioMessage) => {
            if (onAudioUpdate) onAudioUpdate(audioMessage);
        });

        socket.on("conversation_update", (textMessages) => {
            if (onConversationUpdate) onConversationUpdate(textMessages);
        });

        socket.on("conversation_error", (error) => {
            if (onError) onError(error);
        });

        const handleTabClose = () => {
            socket.disconnect();
        };

        window.addEventListener("beforeunload", handleTabClose);

        return () => {
            socket.disconnect();
            socketRef.current = null;
            window.removeEventListener("beforeunload", handleTabClose);
        };
        // Callbacks intentionally omitted: parent passes fresh closures; reconnect only when meeting/auth changes.
    }, [meetingId, creatorKey]);

    return socketRef;
};
