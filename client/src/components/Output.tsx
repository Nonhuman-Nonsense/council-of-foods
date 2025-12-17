import { useState, useEffect } from "react";
import TextOutput from "./TextOutput";
import AudioOutput from "./AudioOutput";
import { ConversationMessage } from "@shared/ModelTypes";
import { DecodedAudioMessage } from "./Council";

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
  // setSentencesLength: (length: number) => void; // Removed in my Council resolution so remove here?
  // Wait, upstream had setSentencesLength. Local Council did NOT pass it.
  // I should check if Output needs it. Upstream Output uses it?
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
  // setSentencesLength
}) => {
  const [currentTextMessage, setCurrentTextMessage] = useState<ConversationMessage | null>(null);
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
      if (textMessage.type === 'summary') {
        const matchingAudioMessage = audioMessages.find((a) => a.id === textMessage.id);
        if (matchingAudioMessage) {
          setCurrentAudioMessage(() => matchingAudioMessage);
        } else {
          setCurrentAudioMessage(null);
        }
      } else {
        setCurrentAudioMessage(null);
      }
    }
  }, [playingNowIndex, councilState]);

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
