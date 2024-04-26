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
  interjectionReplyRecieved,
  onResetInterjectionReply,
}) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [currentTextMessage, setCurrentTextMessage] = useState(null);
  const [currentAudioMessage, setCurrentAudioMessage] = useState(null);
  const [stopAudio, setStopAudio] = useState(false);
  const [totalInterjections, setTotalInterjections] = useState(0);

  useEffect(() => {
    if (interjectionReplyRecieved) {
      console.log(
        "Should be about dancing: ",
        textMessages[textMessages.length - 1].text
      );

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
      currentAudioMessage === null &&
      !interjectionReplyRecieved
    ) {
      onHumanInterjection(false);
      findTextAndAudio();
    }
  }, [isRaisedHand]);

  useEffect(() => {
    console.log("Amount of text messages :", textMessages.length);
    console.log("Amount of voice messages :", audioMessages.length);

    console.log("Text messages:", textMessages);
    console.log("Audio messages:", audioMessages);

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
      console.log("Both found!");

      // Set isReady to true in the parent component to render the controls (for skipping forward et.c.)
      onIsReady();

      setCurrentTextMessage(() => textMessage);
      setCurrentAudioMessage(() => audioMessage);
    }
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
        stopAudio={stopAudio}
      />
    </>
  );
}

export default Output;
