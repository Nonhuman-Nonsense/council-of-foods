import React, { useState } from "react";
import FoodItem from "./FoodItem";
import Overlay from "./Overlay";
import About from "./About";
import Topics from "./Topics";
import Contact from "./Contact";
import Share from "./Share";
import Navbar from "./Navbar"; // Assuming you have this import
import useWindowSize from "../hooks/useWindowSize";

function Council({ options }) {
  const { foods } = options;
  const [activeOverlay, setActiveOverlay] = useState(""); // Tracks which overlay to show
  const { width: screenWidth } = useWindowSize();

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

  // Function to handle overlay content based on navbar clicks
  const displayOverlay = (section) => {
    setActiveOverlay(section); // Update state to control overlay content
  };

  // Conditional rendering of overlay content based on activeOverlay state
  const renderOverlayContent = () => {
    switch (activeOverlay) {
      case "about":
        return <About />;
      case "settings":
        return <Topics currentTopic={options.topic} />;
      case "contact":
        return <Contact />;
      case "share":
        return <Share />;
      default:
        return null; // No overlay content if no section is active
    }
  };

  return (
    <div style={{ height: "100%", width: "100%" }}>
      <div className="wrapper">
        (
        {activeOverlay === "" && (
          <div className="text-container" style={{ justifyContent: "end" }}>
            <h2>
              Lorem ipsum dolor sit.
              <br />
              Lorem ipsum dolor sit amet.
            </h2>
          </div>
        )}
        )
        <div style={foodsContainerStyle}>
          {foods.map((food, index) => (
            <FoodItem
              key={index}
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
        />
      </div>
    </div>
  );
}

export default Council;
