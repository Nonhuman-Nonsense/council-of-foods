import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import FoodItem from "./FoodItem";
import Overlay from "./Overlay";
import CouncilOverlays from "./CouncilOverlays";
import Navbar from "./Navbar";
import Loading from "./Loading";
import Output from "./Output";
import ConversationControls from "./ConversationControls";
import useWindowSize from "../hooks/useWindowSize";
import HumanInput from "./HumanInput";

function Council({ options }) {
  const { foods, humanName, topic } = options;
  const [activeOverlay, setActiveOverlay] = useState("");
  const { width: screenWidth } = useWindowSize();
  const [textMessages, setTextMessages] = useState([]); // State to store conversation updates
  const [audioMessages, setAudioMessages] = useState([]); // To store multiple ArrayBuffers
  const [isRaisedHand, setIsRaisedHand] = useState(false);
  const [isMuted, setMuteUnmute] = useState(false);
  const [isPaused, setPausePlay] = useState(false);
  const [skipForward, setSkipForward] = useState(false);
  const [skipBackward, setSkipBackward] = useState(false);
  const [currentSpeakerName, setCurrentSpeakerName] = useState("");
  const [invitationIndex, setInvitationIndex] = useState(0);
  const [isWaitingToInterject, setIsWaitingToInterject] = useState(false);
  const [isInterjecting, setIsInterjecting] = useState(false);
  const [bumpIndex, setBumpIndex] = useState(false);
  const audioContext = useRef(null); // The AudioContext object
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [canRaiseHand, setCanRaiseHand] = useState(false);
  const [isReadyToStart, setIsReadyToStart] = useState(false);
  const [zoomIn, setZoomIn] = useState(false);

  if (audioContext.current === null) {
    const AudioContext = window.AudioContext || window.webkitAudioContext; //cross browser
    audioContext.current = new AudioContext();
  }

  const socketRef = useRef(null); // Using useRef to persist socket instance

  const foodsContainerStyle = {
    position: "absolute",
    top: "calc(50% + 12vh)",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "70%",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
  };

  useEffect(() => {
    socketRef.current = io();

    const conversationOptions = {
      humanName: humanName,
      topic: topic.prompt,
      characters: foods,
    };

    socketRef.current.emit("start_conversation", conversationOptions);

    socketRef.current.on("conversation_update", (textMessages) => {
      setTextMessages(() => textMessages);
    });

    socketRef.current.on("audio_update", (audioMessage) => {
      (async () => {
        // Decode audio data immediately, because we can only do this once, then buffer is detached
        if (audioMessage.audio) {
          const buffer = await audioContext.current.decodeAudioData(
            audioMessage.audio
          );
          audioMessage.audio = buffer;
        }
        setAudioMessages((prevAudioMessages) => [
          ...prevAudioMessages,
          audioMessage,
        ]);
      })();
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    if (isPaused) {
      audioContext.current.suspend();
    } else if (audioContext.current.state === "suspended") {
      audioContext.current.resume();
    }
  }, [isPaused]);

  useEffect(() => {
    if (activeOverlay !== "" && !isPaused) {
      setPausePlay(true);
    }
  }, [activeOverlay]);

  function handleOnSkipBackward() {
    setSkipBackward(!skipBackward);
  }

  function handleOnSkipForward() {
    setSkipForward(!skipForward);
  }

  function handleMuteUnmute() {
    setMuteUnmute(!isMuted);
  }

  function handlePausePlay() {
    setPausePlay(!isPaused);
  }

  function handleSetCurrentSpeakerName(value) {
    setCurrentSpeakerName(value);
  }

  function raiseHand() {
    // Use a functional update to ensure you have the latest state
    setInvitationIndex((currentInvitationIndex) => {
      console.log("Index is: ", currentInvitationIndex);
      socketRef.current.emit("raise_hand", { index: currentInvitationIndex });
      return currentInvitationIndex; // return the current state without changing it
    });
  }

  useEffect(() => {
    if (isRaisedHand) {
      console.log("Hand raised");

      handleOnIsWaitingToInterject({
        isWaiting: true,
        isReadyToInterject: false,
      });

      raiseHand();
    } else {
      console.log("Hand lowered");

      handleOnIsWaitingToInterject({
        isWaiting: false,
        isReadyToInterject: false,
      });

      if (isInterjecting) {
        // User was currently interjecting but decided to lower their hand...
      }

      lowerHand();
    }
  }, [isRaisedHand]);

  function lowerHand() {
    // const handLoweredOptions = {
    //   index: invitationIndex,
    // };
    // socketRef.current.emit("lower_hand", handLoweredOptions);
  }

  function handleOnSubmitNewTopic(newTopic) {
    socketRef.current.emit("submit_human_message", { text: newTopic });
    setBumpIndex(!bumpIndex);

    setIsReadyToStart(false);

    // TODO: Improve this...

    setIsInterjecting(false);
    setIsRaisedHand(false);
  }

  function handleOnRaiseHandOrNevermind() {
    setIsRaisedHand((prev) => !prev);
  }

  function handleOnIsRaisedHand(invitationIndex) {
    console.log("Setting index: ", invitationIndex);
    setInvitationIndex(() => invitationIndex);
  }

  function displayResetWarning() {
    setActiveOverlay("reset");
  }

  // Function to handle overlay content based on navbar clicks
  const displayOverlay = (section) => {
    setActiveOverlay(section); // Update state to control overlay content
  };

  function removeOverlay() {
    setActiveOverlay("");
  }

  function handleOnIsWaitingToInterject({ isWaiting, isReadyToInterject }) {
    setIsWaitingToInterject(isWaiting);

    if (isReadyToInterject) {
      setIsInterjecting(true);
    }
  }

  //Put water in the middle always
  function mapFoodIndex(total, index){
    return (Math.ceil(total / 2) + index - 1) % total;
  }

  const closeUpBackground = {
    backgroundImage: `url(/images/backgrounds/close-up.jpg)`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    height: "100vh",
    width: "100vw",
    position: "absolute",
    opacity: (zoomIn ? "1" : "0"),
  };

  const bottomShade = {
    width: "100%",
    height: "40%",
    position: "absolute",
    bottom: "0",

    background: "linear-gradient(0, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0) 100%)",
  };

  const topShade = {
    width: "100%",
    height: "10%",
    position: "absolute",
    top: "0",
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0) 100%)",
  };

  return (
    <>
      <div style={closeUpBackground} />
      <div style={bottomShade} />
      <div style={topShade} />
      <Navbar
        topic={options.topic.name}
        activeOverlay={activeOverlay}
        onDisplayOverlay={displayOverlay}
        onRemoveOverlay={removeOverlay}
        onDisplayResetWarning={displayResetWarning}
      />
      <div style={foodsContainerStyle}>
        {foods.map((food, index) => (
          <FoodItem
            key={food.name}
            food={food}
            index={mapFoodIndex(foods.length,index)}
            total={foods.length}
            isPaused={isPaused}
            screenWidth={screenWidth}
            zoomIn={zoomIn}
            currentSpeakerName={currentSpeakerName}
          />
        ))}
      </div>
      {!isReadyToStart && <Loading />}
      <>
        {isInterjecting && (
          <HumanInput onSubmitNewTopic={handleOnSubmitNewTopic} />
        )}
        <Output
          textMessages={textMessages}
          audioMessages={audioMessages}
          isActiveOverlay={activeOverlay !== ""}
          isRaisedHand={isRaisedHand}
          onIsRaisedHand={handleOnIsRaisedHand}
          isMuted={isMuted}
          isPaused={isPaused}
          skipForward={skipForward}
          skipBackward={skipBackward}
          handleSetCurrentSpeakerName={handleSetCurrentSpeakerName}
          onIsWaitingToInterject={handleOnIsWaitingToInterject}
          bumpIndex={bumpIndex}
          audioContext={audioContext}
          setCanGoForward={setCanGoForward}
          setCanGoBack={setCanGoBack}
          setIsReadyToStart={setIsReadyToStart}
          setCanRaiseHand={setCanRaiseHand}
          isReadyToStart={isReadyToStart}
          setZoomIn={setZoomIn}
        />
      </>
      {isReadyToStart && (
        <ConversationControls
          onSkipBackward={handleOnSkipBackward}
          onSkipForward={handleOnSkipForward}
          onRaiseHandOrNevermind={handleOnRaiseHandOrNevermind}
          isRaisedHand={isRaisedHand}
          isWaitingToInterject={isWaitingToInterject}
          isMuted={isMuted}
          onMuteUnmute={handleMuteUnmute}
          isPaused={isPaused}
          onPausePlay={handlePausePlay}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          canRaiseHand={canRaiseHand}
        />
      )}
      <Overlay isActive={activeOverlay !== ""}>
        {activeOverlay !== "" && (
          <CouncilOverlays
            activeOverlay={activeOverlay}
            options={options}
            removeOverlay={removeOverlay}
          />
        )}
      </Overlay>
    </>
  );
}

export default Council;
