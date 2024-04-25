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
  const [humanInterjection, setHumanInterjection] = useState(false);
  const [skipForward, setSkipForward] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [interjectionCounter, setInterjectionCounter] = useState(-1000);
  const [interjectionReplyRecieved, setInterjectionReplyRecieved] =
    useState(false);

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
    initializeConversation(); // Call the function to start the conversation when component mounts
  }, []);

  // Function to initialize or restart the conversation
  const initializeConversation = (customTopic) => {
    const topicToSend = customTopic || topic; // Use custom topic if provided, else use default topic

    socketRef.current = io();

    const promptsAndOptions = {
      options: {
        ...globalOptions,
        humanName,
        raiseHandPrompt: false,
        neverMindPrompt: false,
      },
      name: "New room",
      topic: topicToSend,
      characters: foods,
    };

    socketRef.current.emit("start_conversation", promptsAndOptions);

    socketRef.current.on("conversation_update", (textMessage) => {
      setInterjectionCounter((prev) => prev + 1);
      setTextMessages((prev) => [...prev, textMessage]);
    });

    socketRef.current.on("audio_update", (audioMessage) => {
      setInterjectionCounter((prev) => prev + 1);
      setAudioMessages((prevAudioMessages) => [
        ...prevAudioMessages,
        audioMessage,
      ]);
    });
  };

  useEffect(() => {
    if (interjectionCounter === 2) {
      setInterjectionReplyRecieved(true);
      setHumanInterjection(false);
      setIsRaisedHand(false);
    }
  }, [interjectionCounter]);

  function handleOnResetInterjectionReply() {
    setInterjectionReplyRecieved(false);
  }

  function handleOnIsReady() {
    setIsReady(true);
  }

  function handleOnSkipForward() {
    setSkipForward(!skipForward);
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

    setInterjectionCounter(() => 0);

    socketRef.current.emit("raise_hand", promptsAndOptions);
  }

  function handleOnRaiseHandOrNevermind() {
    setIsRaisedHand((prev) => !prev);
  }

  function handleOnHumanInterjection(value) {
    setHumanInterjection(value);
  }

  function handleOnAddNewTopic(newTopic) {
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

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <div className="council wrapper">
        <div
          className="text-container"
          style={{ justifyContent: "end" }}
        >
          {humanInterjection && (
            <HumanInput onAddNewTopic={handleOnAddNewTopic} />
          )}
          <Output
            textMessages={textMessages}
            audioMessages={audioMessages}
            isActiveOverlay={activeOverlay !== ""}
            isRaisedHand={isRaisedHand}
            onIsReady={handleOnIsReady}
            onHumanInterjection={handleOnHumanInterjection}
            humanInterjection={humanInterjection}
            skipForward={skipForward}
            interjectionReplyRecieved={interjectionReplyRecieved}
            onResetInterjectionReply={handleOnResetInterjectionReply}
          />
          {isReady && (
            <ConversationControls
              onSkipForward={handleOnSkipForward}
              onRaiseHandOrNevermind={handleOnRaiseHandOrNevermind}
              onSubmit={handleOnSubmit}
              isRaisedHand={isRaisedHand}
              humanInterjection={humanInterjection}
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
