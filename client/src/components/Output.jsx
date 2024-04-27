import React, { useState, useEffect } from "react";
import TextOutput from "./TextOutput";
import AudioOutput from "./AudioOutput";

function Output({
  textMessages,
  audioMessages,
  isActiveOverlay,
  isRaisedHand,
  onIsReady,
  isMuted,
  isPaused,
  onHumanInterjection,
  humanInterjection,
  skipForward,
  skipBackward,
  interjectionReplyRecieved,
  onResetInterjectionReply,
}) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [currentTextMessage, setCurrentTextMessage] = useState(null);
  const [currentAudioMessage, setCurrentAudioMessage] = useState(null);
  const [totalInterjections, setTotalInterjections] = useState(0);

  useEffect(() => {
    if (interjectionReplyRecieved) {
      setCurrentTextMessage(textMessages[textMessages.length - 1]);
      setCurrentAudioMessage(audioMessages[audioMessages.length - 1]);

      setTotalInterjections((prev) => prev + 1);

      onResetInterjectionReply();
    }
  }, [interjectionReplyRecieved]);

  useEffect(() => {
    if (currentTextMessage && currentAudioMessage) {
      proceedToNextMessage();
    }
  }, [skipForward]);

  useEffect(() => {
    if (currentTextMessage && currentAudioMessage) {
      goBackToPreviousMessage();
    }
  }, [skipBackward]);

  // useEffect for checking for raised hand when changing message index (inbetween food talking)
  useEffect(() => {
    const maxIndex = textMessages.length - totalInterjections - 1;

    if (
      textMessages.length > 0 &&
      audioMessages.length > 0 &&
      currentMessageIndex >= maxIndex
    ) {
      // Max index reached

      onIsReady(false);
    }

    if (currentMessageIndex)
      if (isRaisedHand) {
        // Check to see if the hand is raised
        // setStopAudio(!stopAudio);
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
      currentAudioMessage === null &&
      !interjectionReplyRecieved
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
    const audioMessage = audioMessages.find((a) => a.id === textMessage.id);

    if (
      textMessage &&
      audioMessage &&
      !currentTextMessage &&
      !currentAudioMessage &&
      !isRaisedHand &&
      !interjectionReplyRecieved
    ) {
      // Set isReady to true in the parent component to render the controls (for skipping forward et.c.)
      onIsReady(true);

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

    // Update the index to the next message, ensuring it doesn't exceed the available range
    // considering interjections that may reduce the number of messages to show
    setCurrentMessageIndex((prev) => {
      // Calculate the maximum index allowed based on the length of the messages and total interjections
      const maxIndex = textMessages.length - totalInterjections - 1;

      // Increment the index if it's within the bounds, otherwise keep it at the maximum allowed index
      return prev < maxIndex ? prev + 1 : maxIndex;
    });
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
        isMuted={isMuted}
      />
    </>
  );
}

export default Output;
