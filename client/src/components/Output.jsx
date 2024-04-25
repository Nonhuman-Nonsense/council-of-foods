import React, { useState, useEffect } from "react";
import TextOutput from "./TextOutput";
import AudioOutput from "./AudioOutput";

function Output({
  textMessages,
  audioMessages,
  isActiveOverlay,
  isRaisedHand,
  onIsReady,
}) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [currentTextMessage, setCurrentTextMessage] = useState(null);
  const [currentAudioMessage, setCurrentAudioMessage] = useState(null);

  // useEffect for raising hand or nevermind when a food is talking
  useEffect(() => {
    if (!isRaisedHand) {
      tryFindTextAndAudio();
    } else {
      console.log("Human interjection time!");
    }
  }, [currentMessageIndex]);

  // useEffect for nevermind when adding new input
  useEffect(() => {
    if (
      !isRaisedHand &&
      currentTextMessage === null &&
      currentAudioMessage === null
    ) {
      tryFindTextAndAudio();
    }
  }, [isRaisedHand]);

  useEffect(() => {
    tryFindTextAndAudio();
  }, [textMessages, audioMessages]);

  useEffect(() => {
    console.log("Hand raised: ", isRaisedHand);
  }, [isRaisedHand]);

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

      onIsReady();

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
