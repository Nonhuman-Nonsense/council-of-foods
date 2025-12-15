import { useEffect, useRef } from 'react';
import io from 'socket.io-client';

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
