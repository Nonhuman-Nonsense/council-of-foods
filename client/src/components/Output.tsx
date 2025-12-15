import { useState, useEffect, MutableRefObject, CSSProperties } from "react";
import TextOutput from "./TextOutput";
import AudioOutput from "./AudioOutput";
import { ConversationMessage as IConversationMessage } from "@shared/ModelTypes";
import { AudioUpdatePayload as IAudioUpdatePayload } from "@shared/SocketTypes";

interface OutputProps {
    textMessages: IConversationMessage[];
    audioMessages: IAudioUpdatePayload[];
    playingNowIndex: number;
    councilState: "loading" | "playing" | "waiting" | "human_input" | "human_panelist" | "summary" | "max_reached";
    isMuted: boolean;
    isPaused: boolean;
    currentSnippetIndex: number;
    setCurrentSnippetIndex: (index: number) => void;
    audioContext: MutableRefObject<AudioContext | null>;
    handleOnFinishedPlaying: () => void;
    setSentencesLength: (length: number) => void;
}

/**
 * Output Component
 * 
 * Orchestrates the playback of audio and text (subtitles).
 * Determines which message to play based on `playingNowIndex` and current `councilState`.
 * 
 * Core Logic:
 * - Syncs `currentTextMessage` and `currentAudioMessage` when state is 'playing'.
 * - Clears output during non-playing states (loading, human input).
 * - Handles special 'summary' state logic.
 */
function Output({
    textMessages,
    audioMessages,
    playingNowIndex,
    councilState,
    isMuted,
    isPaused,
    setCurrentSnippetIndex,
    audioContext,
    handleOnFinishedPlaying,
    setSentencesLength
}: OutputProps): JSX.Element {
    const [currentAudioMessage, setCurrentAudioMessage] = useState<IAudioUpdatePayload | null | undefined>(null);
    const hiddenStyle: CSSProperties = { visibility: "hidden" };

    const showTextOutput = councilState !== 'playing' && councilState !== 'waiting';

    //Everytime the play now index changes, set the current text and audio
    useEffect(() => {
        if (councilState === 'playing') {
            let textMessage = textMessages[playingNowIndex];
            const matchingAudioMessage = audioMessages.find((a) => a.id === textMessage.id);
            setCurrentAudioMessage(matchingAudioMessage);
        } else if (councilState === 'loading' || councilState === 'max_reached' || councilState === 'human_input' || councilState === 'human_panelist') {
            setCurrentAudioMessage(null);
        } else if (councilState === 'summary') {
            let textMessage = textMessages[playingNowIndex];
            if (textMessage.type === 'summary') {
                const matchingAudioMessage = audioMessages.find((a) => a.id === textMessage.id);
                if (matchingAudioMessage) {
                    setCurrentAudioMessage(matchingAudioMessage);
                } else {
                    setCurrentAudioMessage(null);
                }
            } else {
                setCurrentAudioMessage(null);
            }
        }
    }, [playingNowIndex, councilState, textMessages, audioMessages]);

    return (
        <>
            <div style={showTextOutput ? hiddenStyle : {}}>
                <TextOutput
                    currentAudioMessage={currentAudioMessage}
                    isPaused={isPaused}
                    style={councilState !== 'playing' ? hiddenStyle : {}}
                    setCurrentSnippetIndex={setCurrentSnippetIndex}
                    setSentencesLength={setSentencesLength}
                />
            </div>
            <div data-testid="audio-indicator" data-playing={!!currentAudioMessage}>
                <AudioOutput
                    currentAudioMessage={currentAudioMessage ? currentAudioMessage : undefined}
                    onFinishedPlaying={handleOnFinishedPlaying}
                    isMuted={isMuted}
                    audioContext={audioContext}
                />
            </div>
        </>
    );
}

export default Output;
