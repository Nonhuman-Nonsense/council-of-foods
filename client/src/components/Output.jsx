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
      proceedToNextMessage();
    }
  }, [skipForward]);

  // useEffect for checking for raised hand when changing message index (inbetween food talking)
  useEffect(() => {
    // Check to see if the hand is raised
    if (isRaisedHand) {
      setStopAudio(!stopAudio);
      onHumanInterjection(true);
    } else {
      findTextAndAudio();
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
      findTextAndAudio();
    }
  }, [isRaisedHand]);

  useEffect(() => {
    findTextAndAudio();
  }, [textMessages, audioMessages]);

  function findTextAndAudio() {
    const textMessage = textMessages[currentMessageIndex];
    const audioMessage = audioMessages.find(
      (a) => a.message_index === currentMessageIndex
    );

    if (
      textMessage &&
      audioMessage &&
      !currentTextMessage &&
      !currentAudioMessage &&
      !isRaisedHand
    ) {
      console.log("Both found!");

      // Set isReady to true in the parent component to render the controls (for skipping forward et.c.)
      onIsReady();

      setCurrentTextMessage((prev) => textMessage);
      setCurrentAudioMessage((prev) => audioMessage);
    }
  }

  function proceedToNextMessage() {
    setCurrentTextMessage(() => null);
    setCurrentAudioMessage(() => null);
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
