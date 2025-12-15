import { useState, useEffect } from "react";
import TextOutput from "./TextOutput";
import AudioOutput from "./AudioOutput";

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
function Output({
  textMessages,
  audioMessages,
  playingNowIndex,
  councilState,
  isMuted,
  isPaused,
  setCurrentSnippetIndex,
  audioContext,
  handleOnFinishedPlaying
}) {
  const [currentAudioMessage, setCurrentAudioMessage] = useState(null);
  const hiddenStyle = { visibility: "hidden" };

  const showTextOutput = councilState !== 'playing' && councilState !== 'waiting';

  //Everytime the play now index changes, set the current text and audio
  useEffect(() => {
    if (councilState === 'playing') {
      let textMessage = textMessages[playingNowIndex];
      const matchingAudioMessage = audioMessages.find((a) => a.id === textMessage.id);
      setCurrentAudioMessage(() => matchingAudioMessage);
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
