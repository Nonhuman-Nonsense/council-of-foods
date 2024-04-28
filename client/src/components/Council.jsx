import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import FoodItem from "./FoodItem";
import Overlay from "./Overlay";
import CouncilOverlays from "./CouncilOverlays";
import Navbar from "./Navbar";
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
  const [newTopic, setNewTopic] = useState("");
  const [currentSpeakerName, setCurrentSpeakerName] = useState("");
  const [invitationIndex, setInvitationIndex] = useState(0);
  const [isWaitingToInterject, setIsWaitingToInterject] = useState(false);
  const [isInterjecting, setIsInterjecting] = useState(false);

  const socketRef = useRef(null); // Using useRef to persist socket instance

  const foodsContainerStyle = {
    position: "absolute",
    top: "50%",
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
      name: "New room",
      topic: topic,
      characters: foods,
    };

    socketRef.current.emit("start_conversation", conversationOptions);

    socketRef.current.on("conversation_update", (textMessages) => {
      setTextMessages(() => textMessages);
    });

    socketRef.current.on("audio_update", (audioMessage) => {
      setAudioMessages((prevAudioMessages) => [
        ...prevAudioMessages,
        audioMessage,
      ]);
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

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
    const handRaisedOptions = {
      index: invitationIndex,
    };

    socketRef.current.emit("raise_hand", handRaisedOptions);
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

      lowerHand();
    }
  }, [isRaisedHand]);

  function lowerHand() {
    // const handLoweredOptions = {
    //   index: invitationIndex,
    // };
    // socketRef.current.emit("lower_hand", handLoweredOptions);
  }

  function handleOnRaiseHandOrNevermind() {
    setIsRaisedHand((prev) => !prev);
  }

  function handleOnIsRaisedHand(invitatationIndex) {
    setInvitationIndex(invitatationIndex);
  }

  function handleOnInputNewTopic(newTopic) {
    setNewTopic(newTopic);
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
      setIsRaisedHand(false);
    }
  }

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
      <div style={bottomShade} />
      <div style={topShade} />
      <Navbar
        topic={options.topic}
        activeOverlay={activeOverlay}
        onDisplayOverlay={displayOverlay}
        onRemoveOverlay={removeOverlay}
        onDisplayResetWarning={displayResetWarning}
      />
      <Overlay isActive={activeOverlay !== ""}>
        <CouncilOverlays
          activeOverlay={activeOverlay}
          options={options}
          removeOverlay={removeOverlay}
        />
      </Overlay>
      <div style={foodsContainerStyle}>
        {foods.map((food, index) => (
          <FoodItem
            key={food.name}
            food={food}
            index={index}
            total={foods.length}
            screenWidth={screenWidth}
            currentSpeakerName={currentSpeakerName}
          />
        ))}
      </div>
      <>
        {isInterjecting && (
          <HumanInput onInputNewTopic={handleOnInputNewTopic} />
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
        />
      </>
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
      />
    </>
  );
}

export default Council;
