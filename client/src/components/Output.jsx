import React, { useState, useEffect } from "react";
import TextOutput from "./TextOutput";
import AudioOutput from "./AudioOutput";

function Output({ textMessages, audioMessages, isActiveOverlay }) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [currentTextMessage, setCurrentTextMessage] = useState(null);
  const [currentAudioMessage, setCurrentAudioMessage] = useState(null);

  useEffect(() => {
    tryFindTextAndAudio();
  }, [currentMessageIndex, textMessages, audioMessages]);

  function tryFindTextAndAudio() {
    const textMessage = textMessages[currentMessageIndex];
    const audioMessage = audioMessages.find(
      (a) => a.message_index === currentMessageIndex
    );

    if (
      textMessage &&
      audioMessage &&
      !currentTextMessage &&
      !currentAudioMessage
    ) {
      console.log("Both found!");

      setCurrentTextMessage((prev) => textMessage);
      setCurrentAudioMessage((prev) => audioMessage);
    }
  }

  function handleOnFinishedPlaying() {
    setCurrentTextMessage((prev) => null);
    setCurrentAudioMessage((prev) => null);
    setCurrentMessageIndex((prev) => prev + 1);
  }

  return (
    <>
      <TextOutput
        currentTextMessage={currentTextMessage}
        currentAudioMessage={currentAudioMessage}
      />
      <AudioOutput
        currentAudioMessage={currentAudioMessage}
        onFinishedPlaying={handleOnFinishedPlaying}
      />
    </>
  );
}

export default Output;
