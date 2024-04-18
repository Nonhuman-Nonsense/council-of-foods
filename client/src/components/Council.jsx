import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import globalOptions from "../global-options.json";
import FoodItem from "./FoodItem";
import Overlay from "./Overlay";
import About from "./About";
import Topics from "./Topics";
import Contact from "./Contact";
import Share from "./Share";
import ResetWarning from "./ResetWarning";
import Navbar from "./Navbar";
import TextOutput from "./TextOutput";
import useWindowSize from "../hooks/useWindowSize";

function Council({ options }) {
  const { foods, humanName, topic } = options;
  const [activeOverlay, setActiveOverlay] = useState("");
  const { width: screenWidth } = useWindowSize();
  const [conversation, setConversation] = useState([]); // State to store conversation updates
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

    let promptsAndOptions = {
      options: {
        ...globalOptions,
        humanName: humanName,
        raiseHandPrompt: false,
        neverMindPrompt: false,
      },
      name: "New room",
      topic: topic,
      characters: foods,
    };

    socketRef.current.emit("start_conversation", promptsAndOptions);

    // Listen for conversation updates
    socketRef.current.on("conversation_update", (message) => {
      setConversation((prev) => [...prev, message]); // Update conversation state
    });

    // Cleanup on component unmount
    return () => {
      socketRef.current.disconnect();
    };
  }, []);

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

  // Conditional rendering of overlay content based on activeOverlay state
  const renderOverlayContent = () => {
    switch (activeOverlay) {
      case "about":
        return <About />;
      case "settings":
        return (
          <Topics
            currentTopic={options.topic}
            onReset={options.onReset}
            onCancel={removeOverlay}
          />
        );
      case "contact":
        return <Contact />;
      case "share":
        return <Share />;
      case "reset":
        return (
          <ResetWarning
            onReset={() => options.onReset()}
            onCancel={removeOverlay}
          />
        );
      default:
        return null; // No overlay content if no section is active
    }
  };

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <div className="wrapper">
        {activeOverlay === "" && (
          <div
            className="text-container"
            style={{ justifyContent: "end" }}
          >
            <TextOutput conversation={conversation} />
          </div>
        )}
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
          {renderOverlayContent()}
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
