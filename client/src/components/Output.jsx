import React, { useState, useEffect } from "react";
import TextOutput from "./TextOutput";
import AudioOutput from "./AudioOutput";

function Output({
  textMessages,
  audioMessages,
  isActiveOverlay,
  isRaisedHand,
  isMuted,
  isPaused,
  skipForward,
  skipBackward,
  handleSetCurrentSpeakerName,
}) {
  const [actualMessageIndex, setActualMessageIndex] = useState(0);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [currentTextMessage, setCurrentTextMessage] = useState(null);
  const [currentAudioMessage, setCurrentAudioMessage] = useState(null);

  useEffect(() => {
    handleSetCurrentSpeakerName(
      currentTextMessage ? currentTextMessage.speaker : ""
    );
  }, [currentTextMessage]);

  useEffect(() => {
    handleSetCurrentSpeakerName(
      currentTextMessage ? currentTextMessage.speaker : ""
    );
  }, [currentTextMessage]);

  useEffect(() => {
    if (currentTextMessage && currentAudioMessage) {
      proceedToNextMessage();
    }
  }, [skipForward]);

  // TODO: Increase currentMessageIndex to play next message
  useEffect(() => {}, [currentMessageIndex]);

  useEffect(() => {
    if (currentTextMessage && currentAudioMessage) {
      goBackToPreviousMessage();
    }
  }, [skipBackward]);

  useEffect(() => {
    console.log("Text messages: ", textMessages);
    console.log("Audio messages: ", audioMessages);

    findTextAndAudio();
  }, [textMessages, audioMessages]);

  function findTextAndAudio() {
    const textMessage = textMessages[currentMessageIndex];
    const audioMessage = audioMessages.find((a) => a.id === textMessage.id);

    // TODO: Add isRunning flag?
    if (textMessage && audioMessage) {
      setCurrentTextMessage(() => textMessage);
      setCurrentAudioMessage(() => audioMessage);
    }
  }

  function goBackToPreviousMessage() {
    // Reset the current message contents
    setCurrentTextMessage(() => null);
    setCurrentAudioMessage(() => null);

    setCurrentMessageIndex((prev) => {
      return prev - 1 > 0 ? prev - 1 : 0;
    });
  }

  function proceedToNextMessage() {
    // Reset the current message contents
    setCurrentTextMessage(() => null);
    setCurrentAudioMessage(() => null);

    // TODO: Increase actualMessageIndex
    // Update the index to the next message, ensuring it doesn't exceed the available range
    setCurrentMessageIndex((prev) => {
      const maxIndex = textMessages.length - 1;

      // Increment the index if it's within the bounds, otherwise keep it at the maximum allowed index
      return prev < maxIndex ? prev + 1 : maxIndex;
    });
  }

  function handleOnFinishedPlaying() {
    console.log("Finished playing...");

    proceedToNextMessage();
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
        isMuted={isMuted}
      />
    </>
  );
}

export default Output;
