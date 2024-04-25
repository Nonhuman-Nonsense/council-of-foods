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
  const [isReady, setIsReady] = useState(false);
  const [isRaisedHand, setIsRaisedHand] = useState(false);

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

    // Send initial data to start the conversation
    let promptsAndOptions = {
      options: {
        ...globalOptions,
        humanName,
        raiseHandPrompt: false,
        neverMindPrompt: false,
      },
      name: "New room",
      topic,
      characters: foods,
    };
    socketRef.current.emit("start_conversation", promptsAndOptions);

    // Listen for conversation text updates
    socketRef.current.on("conversation_update", (textMessage) => {
      setTextMessages((prev) => [...prev, textMessage]);
    });

    // Listen for audio updates
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

  function handleOnIsReady() {
    setIsReady(true);
  }

  function handleOnRaiseHandOrNevermind() {
    console.log("Setting isRaisedHand...");
    setIsRaisedHand((prev) => !prev);
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

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <div className="council wrapper">
        <div
          className="text-container"
          style={{ justifyContent: "end" }}
        >
          <Output
            textMessages={textMessages}
            audioMessages={audioMessages}
            isActiveOverlay={activeOverlay !== ""}
            isRaisedHand={isRaisedHand}
            onIsReady={handleOnIsReady}
          />
          {isReady && (
            <ConversationControls
              onRaiseHandOrNevermind={handleOnRaiseHandOrNevermind}
              isRaisedHand={isRaisedHand}
            />
          )}
        </div>
        <div style={foodsContainerStyle}>
          {foods.map((food, index) => (
            <FoodItem
              key={food.name}
              food={food}
              index={index}
              total={foods.length}
              screenWidth={screenWidth}
            />
          ))}
        </div>
        <Overlay isActive={activeOverlay !== ""}>
          <CouncilOverlays
            activeOverlay={activeOverlay}
            options={options}
            removeOverlay={removeOverlay}
          />
        </Overlay>
        <Navbar
          topic={options.topic}
          activeOverlay={activeOverlay}
          onDisplayOverlay={displayOverlay}
          onRemoveOverlay={removeOverlay}
          onDisplayResetWarning={displayResetWarning}
        />
      </div>
    </div>
  );
}

export default Council;
