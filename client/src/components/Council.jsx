import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import globalOptions from "../global-options.json";
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
  const [newTopic, setNewTopic] = useState("");
  const [currentSpeakerName, setCurrentSpeakerName] = useState("");

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

    const promptsAndOptions = {
      options: {
        ...globalOptions,
        humanName,
        raiseHandPrompt: false,
        neverMindPrompt: false,
      },
      name: "New room",
      topic: topic,
      characters: foods,
    };

    socketRef.current.emit("start_conversation", promptsAndOptions);

    socketRef.current.on("conversation_update", (textMessages) => {
      setTextMessages(() => textMessages);
    });

    socketRef.current.on("audio_update", (audioMessage) => {
      setAudioMessages((prevAudioMessages) => [
        ...prevAudioMessages,
        audioMessage,
      ]);
    });
  });

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

  function handleOnSubmit() {
    const promptsAndOptions = {
      options: {
        ...globalOptions,
        humanName,
        raiseHandPrompt: newTopic,
        neverMindPrompt: false,
      },
      name: "New room",
      topic: newTopic,
      characters: foods,
    };

    socketRef.current.emit("raise_hand", promptsAndOptions);
  }

  function handleOnRaiseHandOrNevermind() {
    setIsRaisedHand((prev) => !prev);
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
        <HumanInput onInputNewTopic={handleOnInputNewTopic} />

        <Output
          textMessages={textMessages}
          audioMessages={audioMessages}
          isActiveOverlay={activeOverlay !== ""}
          isRaisedHand={isRaisedHand}
          onIsReady={handleOnIsReady}
          isMuted={isMuted}
          isPaused={isPaused}
          onHumanInterjection={handleOnHumanInterjection}
          skipForward={skipForward}
          skipBackward={skipBackward}
          handleSetCurrentSpeakerName={handleSetCurrentSpeakerName}
        />
      </>
      <ConversationControls
        onSkipBackward={handleOnSkipBackward}
        onSkipForward={handleOnSkipForward}
        onRaiseHandOrNevermind={handleOnRaiseHandOrNevermind}
        onSubmit={handleOnSubmit}
        isMuted={isMuted}
        onMuteUnmute={handleMuteUnmute}
        isPaused={isPaused}
        onPausePlay={handlePausePlay}
        isRaisedHand={isRaisedHand}
      />
    </>
  );
}

export default Council;
