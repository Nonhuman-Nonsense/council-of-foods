
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
 * 
 * @param {Object} props
 * @param {Array} props.textMessages - Full list of text transcripts.
 * @param {Array} props.audioMessages - Full list of audio snippets.
 * @param {number} props.playingNowIndex - Index of the currently active message.
 * @param {string} props.councilState - Current global state machine status.
 * @param {boolean} props.isMuted - Global mute flag.
 * @param {boolean} props.isPaused - Global pause flag.
 * @param {number} props.currentSnippetIndex - Sub-index for sentence highlighting.
 * @param {Function} props.setCurrentSnippetIndex - Setter for sub-index.
 * @param {Object} props.audioContext - WebAudio API context.
 * @param {Function} props.handleOnFinishedPlaying - Callback when audio ends.
 * @param {Function} props.setSentencesLength - Callback to report sentence count.
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
  setSentencesLength: (length: number) => void;
}

const Output: React.FC<OutputProps> = ({
  textMessages,
  audioMessages,
  playingNowIndex,
  councilState,
  isMuted,
  isPaused,
  currentSnippetIndex,
  setCurrentSnippetIndex,
  audioContext,
  handleOnFinishedPlaying,
  setSentencesLength
}) => {
  const [currentTextMessage, setCurrentTextMessage] = useState<ConversationMessage | null>(null);
  const [currentAudioMessage, setCurrentAudioMessage] = useState<DecodedAudioMessage | null>(null);
  const hiddenStyle: React.CSSProperties = { visibility: "hidden" };

  const showTextOutput = councilState !== 'playing' && councilState !== 'waiting';

  //Everytime the play now index changes, set the current text and audio
  useEffect(() => {
    if (councilState === 'playing') {
      let textMessage = textMessages[playingNowIndex];
      setCurrentTextMessage(() => textMessage);
      const matchingAudioMessage = audioMessages.find((a) => a.id === textMessage.id);
      setCurrentAudioMessage(() => matchingAudioMessage || null);
    } else if (councilState === 'loading' || councilState === 'max_reached' || councilState === 'human_input' || councilState === 'human_panelist') {
      setCurrentTextMessage(null);
      setCurrentAudioMessage(null);
    } else if (councilState === 'summary') {
      setCurrentTextMessage(null);
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
          currentTextMessage={currentTextMessage}
          currentAudioMessage={currentAudioMessage}
          isPaused={isPaused}
          style={(councilState !== 'playing' && councilState !== 'waiting') ? (hiddenStyle as React.CSSProperties) : undefined}
          setCurrentSnippetIndex={setCurrentSnippetIndex}
          setSentencesLength={setSentencesLength}
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
