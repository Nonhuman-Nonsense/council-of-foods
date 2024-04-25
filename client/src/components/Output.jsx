import React, { useState, useEffect } from "react";
import TextOutput from "./TextOutput";
import AudioOutput from "./AudioOutput";

function Output({
  textMessages,
  audioMessages,
  isActiveOverlay,
  isRaisedHand,
  onIsReady,
  onHumanInterjection,
  humanInterjection,
  skipForward,
}) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [currentTextMessage, setCurrentTextMessage] = useState(null);
  const [currentAudioMessage, setCurrentAudioMessage] = useState(null);
  const [stopAudio, setStopAudio] = useState(false);

  useEffect(() => {
    if (currentTextMessage && currentAudioMessage) {
      console.log("Skipping forward");
      proceedToNextMessage();
    }
  }, [skipForward]);

  // useEffect for checking for raised hand when changing message index (inbetween food talking)
  useEffect(() => {
    if (!isRaisedHand) {
      tryFindTextAndAudio();
    } else {
      setStopAudio(!stopAudio);
      onHumanInterjection(true);
    }
  }, [currentMessageIndex]);

  // useEffect for nevermind when adding new input
  useEffect(() => {
    if (
      !isRaisedHand &&
      currentTextMessage === null &&
      currentAudioMessage === null
    ) {
      onHumanInterjection(false);
      tryFindTextAndAudio();
    }
  }, [isRaisedHand]);

  useEffect(() => {
    tryFindTextAndAudio();
  }, [textMessages, audioMessages]);

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

  function proceedToNextMessage() {
    setCurrentTextMessage((prev) => null);
    setCurrentAudioMessage((prev) => null);
    setCurrentMessageIndex((prev) => prev + 1);
  }

  function handleOnFinishedPlaying() {
    proceedToNextMessage();
  }

  return (
    <>
      {!humanInterjection && (
        <TextOutput
          currentTextMessage={currentTextMessage}
          currentAudioMessage={currentAudioMessage}
        />
      )}
      <AudioOutput
        currentAudioMessage={currentAudioMessage}
        onFinishedPlaying={handleOnFinishedPlaying}
        stopAudio={stopAudio}
      />
    </>
  );
}

export default Output;
