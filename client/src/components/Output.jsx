import { useState, useEffect } from "react";
import TextOutput from "./TextOutput";
import AudioOutput from "./AudioOutput";

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
      setCurrentTextMessage(null);
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
