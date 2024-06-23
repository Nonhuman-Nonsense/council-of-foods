import React, { useState, useEffect, useRef } from "react";
import TextOutput from "./TextOutput";
import AudioOutput from "./AudioOutput";

function Output({
  textMessages,
  audioMessages,
  isMuted,
  isPaused,
  skipForward,
  skipBackward,
  handleSetCurrentSpeakerName,
  onIsWaitingToInterject,
  isWaitingToInterject,
  bumpIndex1,
  audioContext,
  setCanGoForward,
  setCanGoBack,
  setIsReadyToStart,
  setCanRaiseHand,
  isReadyToStart,
  setZoomIn,
  isInterjecting,
  onCompletedConversation,
  onCompletedSummary,
  currentMessageIndex,
  setCurrentMessageIndex,
  conversationMaxLength,
  invitation,
  playInvitation,
  setPlayinvitation,
  onResumeConversation,
  summary,
}) {
  const [actualMessageIndex, setActualMessageIndex] = useState(0);
  const [currentTextMessage, setCurrentTextMessage] = useState(null);
  const [currentAudioMessage, setCurrentAudioMessage] = useState(null);
  const [isFoundMessage, setIsFoundMessage] = useState(false);
  const [pausedInBreak, setPausedInBreak] = useState(false);
  const [proceedToNextMessage, setProceedToNextMessage] = useState(false);

  const hiddenStyle = { visibility: "hidden" };

  useEffect(() => {
    if (summary) {
      // Add the summary to the text messages
      textMessages.push(summary);
    }
  }, [summary]);

  useEffect(() => {
    if (currentMessageIndex === 0 || playInvitation) {
      setCanGoBack(false);
    } else {
      setCanGoBack(true);
    }
    if (
      currentMessageIndex < textMessages.length - 1 &&
      !playInvitation &&
      audioMessages.find(
        (a) => a.message_id === textMessages[currentMessageIndex + 1].id
      )
    ) {
      setCanGoForward(true);
    } else if (currentMessageIndex === conversationMaxLength - 1) {
      setCanGoForward(true);
    } else {
      setCanGoForward(false);
    }
  }, [currentMessageIndex, textMessages, audioMessages, playInvitation]);

  useEffect(() => {
    if (
      currentMessageIndex === actualMessageIndex &&
      !playInvitation &&
      currentTextMessage?.purpose !== "summary" &&
      currentMessageIndex !== conversationMaxLength - 1
    ) {
      setCanRaiseHand(true);
    } else {
      setCanRaiseHand(false);
    }
  }, [actualMessageIndex, currentMessageIndex, playInvitation]);

  useEffect(() => {
    if (currentTextMessage && currentAudioMessage) {
      console.log(
        `Bumping up current message index by 1, to ${currentMessageIndex + 1}`
      );
      setCurrentMessageIndex((prev) => prev + 1);
    }
  }, [bumpIndex1]);

  useEffect(() => {
    handleSetCurrentSpeakerName(
      currentTextMessage ? currentTextMessage.speaker : ""
    );
  }, [currentTextMessage]);

  useEffect(() => {
    if (currentTextMessage && currentAudioMessage) {
      setProceedToNextMessage(true);
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
    console.log("Updating textMessages: ", textMessages);
    console.log("Updating audioMessages: ", audioMessages);

    findTextAndAudio();
  }, [textMessages, audioMessages]);

  function findTextAndAudio(custom) {
    const textMessage = custom ? custom : textMessages[currentMessageIndex];

    if (textMessage) {
      const audioMessage = audioMessages.find(
        (a) => a.message_id === textMessage.id
      );

      if (audioMessage && !isFoundMessage) {
        console.log("Found text and audio");
        console.log("Text: ", textMessage);
        console.log("Audio: ", audioMessage);
        setIsReadyToStart(true);

        if (textMessage.shouldResume) {
          console.log("It's a continuation message!");
          onResumeConversation();
        }

        setIsFoundMessage(() => true);

        setCurrentTextMessage(() => textMessage);
        setCurrentAudioMessage(() => audioMessage);
      }
    }
  }

  // Helper function to increment the message index safely for current-, and actual message index
  function incrementIndex(prevIndex) {
    // const maxIndex = textMessages.length - 1;
    // return prevIndex < maxIndex ? prevIndex + 1 : maxIndex;
    return prevIndex + 1;
  }

  function goBackToPreviousMessage() {
    console.log("Going back to previous message...");
    setIsFoundMessage(() => false);
    setCurrentMessageIndex((prev) => {
      return prev - 1 > 0 ? prev - 1 : 0;
    });
  }

  useEffect(() => {
    console.log("PROCEEDING...");

    if (proceedToNextMessage) {
      console.log("Proceeding to next message...");
      setProceedToNextMessage(() => false);
      setIsFoundMessage(() => false);

      const currentIndex = currentMessageIndex;
      const maxIndex = textMessages.length - 1;
      const currentMessage = textMessages[currentIndex];

      //If hand is raised when previous message finishes
      if (isWaitingToInterject) {
        //If the invitation is ready
        if (invitation && !playInvitation) {
          setPlayinvitation(true);
        } else if (playInvitation) {
          setPlayinvitation(false);
          handleInterjection();
        } else {
          //wait, we might have raised hand last moment of a message
          setIsReadyToStart(false);
        }
        return;
      }

      // Check if we're at the end of the list and if its an interjection
      if (currentIndex >= maxIndex) {
        console.log("Reached the end of the message list.");

        console.log("Current message: ", currentMessage);

        if (currentMessage && currentMessage.purpose === "summary") {
          // TODO: Reset?
          onCompletedSummary();
        } else if (currentIndex === conversationMaxLength - 1) {
          // Conversation is completed
          console.log("Conversation completed!");
          onCompletedConversation();
        } else {
          // We should have more messages, but they are not ready for some reason
          // So we wait
          console.log("Waiting for more messages!");
          setIsReadyToStart(false);
          const test = incrementIndex(currentMessageIndex);
          console.log(test);
          setCurrentMessageIndex(test);
        }

        return;
      }

      // Increment message index safely
      setCurrentMessageIndex(incrementIndex);
    }
  }, [proceedToNextMessage]);

  function handleInterjection() {
    // Define what to do when an interjection is encountered
    onIsWaitingToInterject({ isWaiting: false, isReadyToInterject: true });
  }

  // Use a ref to access the current count value in an async callback.
  //https://github.com/facebook/react/issues/14010
  const isPausedRef = useRef(isPaused);
  const betweenTimer = useRef(null);
  isPausedRef.current = isPaused;

  function handleOnFinishedPlaying() {
    console.log("Finished playing message...");

    setZoomIn(false);
    //If the audio has ended, wait a bit before proceeding
    //Unless last message was invitation
    const waitTime = currentTextMessage?.purpose === "invitation" ? 0 : 1000;
    betweenTimer.current = setTimeout(() => {
      if (!isPausedRef.current) {
        setProceedToNextMessage(true);
      } else {
        setPausedInBreak(true);
      }
    }, waitTime);
  }
  //Make sure to empty this timer on component unmount
  //Incase someone restarts the counsil in a break etc.
  useEffect(() => {
    // The empty the betweenTimer on unmount
    return () => {
      clearTimeout(betweenTimer.current);
    };
  }, []);

  //If at any time we were paused in a break between messages
  //We need to proceed manually
  useEffect(() => {
    if (!isPaused && pausedInBreak) {
      setProceedToNextMessage(true);
      setPausedInBreak(false);
    }
  }, [isPaused, pausedInBreak]);

  useEffect(() => {
    if (
      currentMessageIndex === 0 ||
      currentTextMessage.type == "human" ||
      currentTextMessage.purpose == "summary"
    ) {
      setZoomIn(false);
    }
  }, [currentMessageIndex, currentTextMessage]);

  return (
    <>
      <div
        style={
          !isReadyToStart ||
          isInterjecting ||
          currentTextMessage.purpose === "summary"
            ? hiddenStyle
            : {}
        }
      >
        <TextOutput
          currentTextMessage={currentTextMessage}
          currentAudioMessage={currentAudioMessage}
          isPaused={isPaused}
          style={!isReadyToStart ? hiddenStyle : {}}
          setZoomIn={
            currentMessageIndex === 0 || currentTextMessage?.type === "human"
              ? () => {
                  return;
                }
              : setZoomIn
          }
        />
      </div>
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
