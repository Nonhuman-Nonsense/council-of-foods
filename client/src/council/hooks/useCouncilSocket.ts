import type { Message } from '@shared/ModelTypes';
import { useEffect, useRef, type RefObject } from 'react';
import { io, Socket } from 'socket.io-client';
import {
    ServerToClientEvents,
    ClientToServerEvents,
    AudioUpdatePayload,
    ErrorPayload
} from '@shared/SocketTypes';
import { log, summarizeLogPayload } from '@/logger';

export interface UseCouncilSocketProps {
    meetingId: number;
    /** Required to authenticate `start_conversation`; omit until known. */
    liveKey: string | undefined;
    onAudioUpdate?: (data: AudioUpdatePayload) => void;
    onConversationUpdate?: (data: Message[]) => void;
    onError?: (error: ErrorPayload) => void;
    onConnectionError?: (error: Error) => void;
    onReconnect?: () => void;
}

function summarizeSocketIn(event: string, payload: unknown): unknown {
    if (event === 'audio_update' && payload && typeof payload === 'object') {
        const audio = payload as AudioUpdatePayload;
        return summarizeLogPayload({
            id: audio.id,
            type: audio.type,
            sentenceCount: audio.sentences?.length ?? 0,
            sentences: audio.sentences?.map((s) => s.text),
        });
    }
    if (event === 'conversation_update' && Array.isArray(payload)) {
        return summarizeLogPayload({
            messageCount: payload.length,
            messages: payload,
        });
    }
    if (event === 'conversation_error' && payload && typeof payload === 'object') {
        return summarizeLogPayload(payload);
    }
    return summarizeLogPayload(payload);
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
    liveKey,
    onAudioUpdate,
    onConversationUpdate,
    onError,
    onConnectionError,
    onReconnect
}: UseCouncilSocketProps): RefObject<Socket<ServerToClientEvents, ClientToServerEvents> | null> => {
    const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);

    useEffect(() => {
        if (!liveKey) {
            return;
        }

        const socket = io();
        socketRef.current = socket;

        log.event('SOCKET', 'connecting', { meetingId });

        socket.on('connect', () => {
            log.event('SOCKET', 'connected', { meetingId, socketId: socket.id });
        });

        socket.on('connect_error', (err: Error) => {
            log.event('ERROR', 'socket connect_error', err);
            if (onConnectionError) onConnectionError(err);
        });

        socket.on('disconnect', (reason: string) => {
            log.event('SOCKET', 'disconnected', { meetingId, reason });
            console.log(reason);
        });

        socket.io.on("reconnect", () => {
            log.event('SOCKET', 'reconnected', { meetingId });
            if (onReconnect) onReconnect();
        });

        log.event('SOCKET', 'OUT start_conversation', { meetingId });
        socket.emit("start_conversation", { meetingId, liveKey });

        socket.on("audio_update", (audioMessage) => {
            log.event('SOCKET', 'IN audio_update', summarizeSocketIn('audio_update', audioMessage));
            if (onAudioUpdate) onAudioUpdate(audioMessage);
        });

        socket.on("conversation_update", (textMessages) => {
            log.event('SOCKET', 'IN conversation_update', summarizeSocketIn('conversation_update', textMessages));
            if (onConversationUpdate) onConversationUpdate(textMessages);
        });

        socket.on("conversation_error", (error) => {
            log.event('SOCKET', 'IN conversation_error', summarizeSocketIn('conversation_error', error));
            if (onError) onError(error);
        });

        const handleTabClose = () => {
            log.event('SOCKET', 'disconnect beforeunload', { meetingId });
            socket.disconnect();
        };

        window.addEventListener("beforeunload", handleTabClose);

        return () => {
            log.event('SOCKET', 'cleanup disconnect', { meetingId });
            socket.disconnect();
            socketRef.current = null;
            window.removeEventListener("beforeunload", handleTabClose);
        };
        // Callbacks intentionally omitted: parent passes fresh closures; reconnect only when meeting/auth changes.
    }, [meetingId, liveKey]);

    return socketRef;
};
