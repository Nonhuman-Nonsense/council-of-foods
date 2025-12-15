import { useEffect, useRef } from 'react';
import io from 'socket.io-client';

/**
 * useCouncilSocket Hook
 *
 * Manages the WebSocket connection for the Council meeting.
 * Handles connecting, emitting setup events, and dispatching incoming updates
 * to the provided callback functions.
 *
 * @param {Object} props
 * @param {Object} props.topic - The selected topic object.
 * @param {Array} props.participants - List of participants (foods/humans).
 * @param {string} props.lang - Language code (e.g. 'en').
 * @param {Function} props.onMeetingStarted - Callback when valid meeting init is received.
 * @param {Function} props.onAudioUpdate - Callback when an audio chunk arrives.
 * @param {Function} props.onConversationUpdate - Callback when text transcripts arrive.
 * @param {Function} props.onError - Callback for conversation logic errors.
 * @param {Function} props.onConnectionError - Callback for socket connection errors.
 * @param {Function} props.onReconnect - Callback for successful reconnection.
 * @returns {Object} socketRef - Ref containing the socket instance.
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
}) => {
    const socketRef = useRef(null);

    useEffect(() => {
        // Connect to the server
        socketRef.current = io();

        socketRef.current.on('connect_error', err => {
            console.error(err);
            if (onConnectionError) onConnectionError(err);
        });

        socketRef.current.on('connect_failed', err => {
            console.log(err);
        });

        socketRef.current.on('disconnect', err => {
            console.log(err);
        });

        let conversationOptions = {
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
        const handleTabClose = (event) => {
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
