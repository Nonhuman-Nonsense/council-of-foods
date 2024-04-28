import React, { useState, useEffect } from "react";
import TextOutput from "./TextOutput";
import AudioOutput from "./AudioOutput";

function Output({
  textMessages,
  audioMessages,
  isActiveOverlay,
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
  useEffect(() => {
    if (currentMessageIndex > actualMessageIndex) {
      setActualMessageIndex(incrementIndex);
    }

    findTextAndAudio();
  }, [currentMessageIndex]);

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

    if (textMessage && audioMessage) {
      setCurrentTextMessage(() => textMessage);
      setCurrentAudioMessage(() => audioMessage);
    }
  }

  // Helper function to increment the message index safely for current-, and actual message index
  function incrementIndex(prevIndex) {
    const maxIndex = textMessages.length - 1;
    return prevIndex < maxIndex ? prevIndex + 1 : maxIndex;
  }

  function goBackToPreviousMessage() {
    console.log("Going back to previous message...");

    setCurrentMessageIndex((prev) => {
      return prev - 1 > 0 ? prev - 1 : 0;
    });
  }

  function proceedToNextMessage() {
    console.log("Proceeding to next message...");

    setCurrentMessageIndex(incrementIndex);
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
