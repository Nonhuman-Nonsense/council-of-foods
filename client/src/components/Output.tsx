
import { useState, useEffect } from "react";
import TextOutput from "./TextOutput";
import AudioOutput from "./AudioOutput";
import { ConversationMessage } from "@shared/ModelTypes";
import { DecodedAudioMessage } from "../hooks/useCouncilMachine";

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
interface OutputProps {
  textMessages: ConversationMessage[];
  audioMessages: DecodedAudioMessage[];
  playingNowIndex: number;
  councilState: string;
  isMuted: boolean;
  isPaused: boolean;
  currentSnippetIndex: number;
  setCurrentSnippetIndex: (index: number) => void;
  audioContext: React.MutableRefObject<AudioContext | null>;
  handleOnFinishedPlaying: () => void;
}

const Output: React.FC<OutputProps> = ({
  textMessages,
  audioMessages,
  playingNowIndex,
  councilState,
  isMuted,
  isPaused,
  setCurrentSnippetIndex,
  audioContext,
  handleOnFinishedPlaying,
}) => {
  const [currentAudioMessage, setCurrentAudioMessage] = useState<DecodedAudioMessage | null>(null);
  const hiddenStyle: React.CSSProperties = { visibility: "hidden" };

  const showTextOutput = councilState !== 'playing' && councilState !== 'waiting';

  //Everytime the play now index changes, set the current text and audio
  useEffect(() => {
    if (councilState === 'playing') {
      let textMessage = textMessages[playingNowIndex];
      const matchingAudioMessage = audioMessages.find((a) => a.id === textMessage.id);
      setCurrentAudioMessage(() => matchingAudioMessage || null);
    } else if (councilState === 'loading' || councilState === 'max_reached' || councilState === 'human_input' || councilState === 'human_panelist') {
      setCurrentAudioMessage(null);
    } else if (councilState === 'summary') {
      let textMessage = textMessages[playingNowIndex];
      if (textMessage && textMessage.type === 'summary') { // Added check for textMessage existence
        const matchingAudioMessage = audioMessages.find((a) => a.id === textMessage.id);
        setCurrentAudioMessage(() => matchingAudioMessage || null); // Simplified to directly set null if not found
      } else {
        setCurrentAudioMessage(null);
      }
    }
  }, [playingNowIndex, councilState, textMessages, audioMessages]); // Added textMessages and audioMessages to dependency array

  return (
    <>
      <div style={showTextOutput ? hiddenStyle : {}}>
        <TextOutput
          currentAudioMessage={currentAudioMessage}
          isPaused={isPaused}
          setCurrentSnippetIndex={setCurrentSnippetIndex}
        />
      </div>
      <div data-testid="audio-indicator" data-playing={!!currentAudioMessage}>
        <AudioOutput
          currentAudioMessage={currentAudioMessage}
          onFinishedPlaying={handleOnFinishedPlaying}
          isMuted={isMuted}
          audioContext={audioContext}
        />
      </div>
    </>
  );
}

export default Output;
