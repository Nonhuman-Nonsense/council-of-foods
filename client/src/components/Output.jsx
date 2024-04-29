import React, { useState, useEffect, useRef } from "react";
import TextOutput from "./TextOutput";
import AudioOutput from "./AudioOutput";

function Output({
  textMessages,
  audioMessages,
  isActiveOverlay,
  isRaisedHand,
  onIsRaisedHand,
  isMuted,
  isPaused,
  skipForward,
  skipBackward,
  handleSetCurrentSpeakerName,
  onIsWaitingToInterject,
  bumpIndex,
  audioContext,
}) {
  const [actualMessageIndex, setActualMessageIndex] = useState(0);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [currentTextMessage, setCurrentTextMessage] = useState(null);
  const [currentAudioMessage, setCurrentAudioMessage] = useState(null);
  const [isFoundMessage, setIsFoundMessage] = useState(false);
  const [pausedInBreak, setPausedInBreak] = useState(false);

  useEffect(() => {
    if (currentTextMessage && currentAudioMessage) {
      console.log("Bumping up current message index by 2");
      setCurrentMessageIndex((prev) => prev + 2);
    }
  }, [bumpIndex]);

  // Emit currentMessageIndex + 1 to parent for invitation message index
  useEffect(() => {
    onIsRaisedHand(currentMessageIndex + 1);
  }, [isRaisedHand]);

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
      setActualMessageIndex(currentMessageIndex);
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

    console.log("Looking for text with index: ", currentMessageIndex);

    findTextAndAudio();
  }, [textMessages, audioMessages]);

  function findTextAndAudio() {
    const textMessage = textMessages[currentMessageIndex];

    if (textMessage) {
      const audioMessage = audioMessages.find((a) => a.id === textMessage.id);

      if (audioMessage && !isFoundMessage) {
        console.log("Found text and audio");
        console.log("Text: ", textMessage);
        console.log("Audio: ", audioMessage);

        setIsFoundMessage(() => true);

        setCurrentTextMessage(() => textMessage);
        setCurrentAudioMessage(() => audioMessage);
      }
    }
  }

  // Helper function to increment the message index safely for current-, and actual message index
  function incrementIndex(prevIndex) {
    const maxIndex = textMessages.length - 1;
    return prevIndex < maxIndex ? prevIndex + 1 : maxIndex;
  }

  function goBackToPreviousMessage() {
    console.log("Going back to previous message...");
    setIsFoundMessage(() => false);
    setCurrentMessageIndex((prev) => {
      return prev - 1 > 0 ? prev - 1 : 0;
    });
  }

  function proceedToNextMessage() {
    console.log("Proceeding to next message...");
    setIsFoundMessage(() => false);

    const currentIndex = currentMessageIndex;
    const maxIndex = textMessages.length - 1;
    const currentMessage = textMessages[currentIndex];

    // Check if we're at the end of the list and if its an interjection
    if (currentIndex >= maxIndex) {
      console.log("Reached the end of the message list.");

      if (currentMessage.purpose === "invitation") {
        handleInterjection();
      }
      return;
    }

    // Increment message index safely
    setCurrentMessageIndex(incrementIndex);
  }

  function handleInterjection() {
    // Define what to do when an interjection is encountered
    console.log("Start audio recording et.c.");

    onIsWaitingToInterject({ isWaiting: false, isReadyToInterject: true });
  }

  // Use a ref to access the current count value in an async callback.
  //https://github.com/facebook/react/issues/14010
  const isPausedRef = useRef(isPaused);
  const betweenTimer = useRef(null);
  isPausedRef.current = isPaused;
  function handleOnFinishedPlaying() {
    console.log("Finished playing message...");

    //If the audio has ended, wait a bit before proceeding
    betweenTimer.current = setTimeout(() => {
      if(!isPausedRef.current){
        proceedToNextMessage();
      }else{
        setPausedInBreak(true);
      }
    }, 1000);
  }
  //Make sure to empty this timer on component unmount
  //Incase someone restarts the counsil in a break etc.
  useEffect(() => {
  // The empty the betweenTimer on unmount
  return () => {clearTimeout(betweenTimer.current)};
  }, []);

  //If at any time we were paused in a break between messages
  //We need to proceed manually
  useEffect(() => {
    if(!isPaused && pausedInBreak){
      proceedToNextMessage();
      setPausedInBreak(false);
    }
  },[isPaused, pausedInBreak]);

  return (
    <>
      <TextOutput
        currentTextMessage={currentTextMessage}
        currentAudioMessage={currentAudioMessage}
        isPaused={isPaused}
      />
      <AudioOutput
        currentAudioMessage={currentAudioMessage}
        onFinishedPlaying={handleOnFinishedPlaying}
        isMuted={isMuted}
        audioContext={audioContext}
      />
    </>
  );
}

export default Output;
