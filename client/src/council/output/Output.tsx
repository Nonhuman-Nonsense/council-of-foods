
import { useState, useEffect } from "react";
import TextOutput from "./TextOutput";
import AudioOutput from "./AudioOutput";
import { Message } from "@shared/ModelTypes";
import type { DecodedAudioMessage } from "@shared/SocketTypes";
import type { PlaybackStartInfo } from "./AudioOutputMessage";

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
  textMessages: Message[];
  audioMessages: DecodedAudioMessage[];
  playingNowIndex: number;
  councilState: string;
  isMuted: boolean;
  isPaused: boolean;
  currentSnippetIndex: number;
  setCurrentSnippetIndex: (index: number) => void;
  audioContext: React.RefObject<AudioContext | null>;
  handleOnFinishedPlaying: () => void;
  /** Hide council subtitles (e.g. while meta-agent captions are shown). */
  hideSubtitles?: boolean;
}

const Output: React.FC<OutputProps> = ({
  textMessages,
  audioMessages,
  playingNowIndex,
  councilState,
  isMuted,
  isPaused,
  currentSnippetIndex: _currentSnippetIndex,
  setCurrentSnippetIndex,
  audioContext,
  handleOnFinishedPlaying,
  hideSubtitles = false,
}) => {
  const [currentAudioMessage, setCurrentAudioMessage] = useState<DecodedAudioMessage | null>(null);
  const [playbackStartInfo, setPlaybackStartInfo] = useState<PlaybackStartInfo | null>(null);
  const hiddenStyle: React.CSSProperties = { visibility: "hidden" };

  const showTextOutput = councilState !== 'playing' && councilState !== 'waiting';

  //Everytime the play now index changes, set the current text and audio
  useEffect(() => {
    if (councilState === 'playing') {
      const textMessage = textMessages[playingNowIndex];
      const matchingAudioMessage = audioMessages.find((a) => a.id === textMessage.id);
      setCurrentAudioMessage(() => matchingAudioMessage || null);
      setPlaybackStartInfo((current) => current?.messageId === matchingAudioMessage?.id ? current : null);
    } else if (councilState === 'loading' || councilState === 'query_extension' || councilState === 'human_input' || councilState === 'human_panelist') {
      setCurrentAudioMessage(null);
      setPlaybackStartInfo(null);
    } else if (councilState === 'summary') {
      const textMessage = textMessages[playingNowIndex];
      if (textMessage && textMessage.type === 'summary') { // Added check for textMessage existence
        const matchingAudioMessage = audioMessages.find((a) => a.id === textMessage.id);
        setCurrentAudioMessage(() => matchingAudioMessage || null); // Simplified to directly set null if not found
        setPlaybackStartInfo((current) => current?.messageId === matchingAudioMessage?.id ? current : null);
      } else {
        setCurrentAudioMessage(null);
        setPlaybackStartInfo(null);
      }
    }
  }, [playingNowIndex, councilState, textMessages, audioMessages]); // Added textMessages and audioMessages to dependency array

  return (
    <>
      <TextOutput
        currentAudioMessage={currentAudioMessage}
        audioContext={audioContext}
        playbackStartInfo={playbackStartInfo}
        isPaused={isPaused}
        style={showTextOutput || hideSubtitles ? hiddenStyle : undefined}
        setCurrentSnippetIndex={setCurrentSnippetIndex}
      />
      <div data-testid="audio-indicator" data-playing={!!currentAudioMessage}>
        <AudioOutput
          currentAudioMessage={currentAudioMessage}
          onFinishedPlaying={handleOnFinishedPlaying}
          onPlaybackStarted={setPlaybackStartInfo}
          isMuted={isMuted}
          audioContext={audioContext}
        />
      </div>
    </>
  );
}

export default Output;
