import { useEffect, useRef, MutableRefObject } from 'react';
import { io, Socket } from 'socket.io-client';
import {
    ServerToClientEvents,
    ClientToServerEvents,
    AudioUpdatePayload,
    ErrorPayload
} from '@shared/SocketTypes';
import { Character, ConversationMessage } from '@shared/ModelTypes';

export interface UseCouncilSocketProps {
    topic: { prompt: string;[key: string]: any };
    participants: Character[];
    lang: string;
    onMeetingStarted?: (data: { meeting_id: number | string | null }) => void;
    onAudioUpdate?: (data: AudioUpdatePayload) => void;
    onConversationUpdate?: (data: ConversationMessage[]) => void;
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
    topic,
    participants,
    lang,
    onMeetingStarted,
    onAudioUpdate,
    onConversationUpdate,
    onError,
    onConnectionError,
    onReconnect
}: UseCouncilSocketProps): MutableRefObject<Socket<ServerToClientEvents, ClientToServerEvents> | null> => {
    const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);

    useEffect(() => {
        // Connect to the server
        socketRef.current = io();

        socketRef.current.on('connect_error', (err: Error) => {
            console.error(err);
            if (onConnectionError) onConnectionError(err);
        });

        socketRef.current.on('connect_error', (err: any) => {
            console.log(err);
        });

        socketRef.current.on('disconnect', (err: any) => {
            console.log(err);
        });

        const conversationOptions = {
            topic: topic.prompt,
            characters: participants,
            language: lang
        };

        socketRef.current.io.on("reconnect", () => {
            if (onReconnect) onReconnect();
        });

        socketRef.current.emit("start_conversation", conversationOptions);

        socketRef.current.on("meeting_started", (meeting) => {
            if (onMeetingStarted) onMeetingStarted(meeting);
        });

        socketRef.current.on("audio_update", (audioMessage) => {
            if (onAudioUpdate) onAudioUpdate(audioMessage);
        });

        socketRef.current.on("conversation_update", (textMessages) => {
            if (onConversationUpdate) onConversationUpdate(textMessages);
        });

        socketRef.current.on("conversation_error", (error) => {
            if (onError) onError(error);
        });

        // Add event listener for tab close
        const handleTabClose = () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };

        window.addEventListener("beforeunload", handleTabClose);

        // Clean up the socket connection when the component unmounts
        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
            window.removeEventListener("beforeunload", handleTabClose);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run once on mount

    return socketRef;
};
