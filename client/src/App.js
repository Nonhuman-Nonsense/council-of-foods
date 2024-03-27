import "./App.css";
import React, { useState, useEffect } from "react";
import Overlay from "./components/Overlay";
import Landing from "./components/Landing";
import Welcome from "./components/Welcome";
import Topics from "./components/Topics";
import Foods from "./components/Foods";
import Navbar from "./components/Navbar";
import Council from "./components/Council";

function App() {
  const [humanName, setHumanName] = useState("");
  const [topic, setTopic] = useState("");
  const [foods, setFoods] = useState([]);
  const pages = ["landing", "welcome", "topics", "foods", "council"];
  const [currentView, setCurrentView] = useState(pages[0]);
  const [isOverlayActive, setIsOverlayActive] = useState(true);
  const [backgroundImageURL, setBackgroundImageURL] = useState(
    "/images/backgrounds/zoomed-out.jpg"
  );

  const backgroundStyle = {
    backgroundImage: `url(${backgroundImageURL})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    height: "100vh",
    width: "100vw",
  };

  useEffect(() => {
    if (currentView === pages[0]) {
      setBackgroundImageURL("/images/backgrounds/zoomed-out.jpeg");
    } else {
      setBackgroundImageURL("/images/backgrounds/zoomed-in.png");
    }
  }, [currentView]);

  function continueForward(props) {
    // Set properties
    if (props && props.hasOwnProperty("humanName")) {
      setHumanName(props.humanName);
    } else if (props && props.hasOwnProperty("topic")) {
      setTopic(props.topic);
    } else if (props && props.hasOwnProperty("foods")) {
      setFoods(props.foods);
    }

    // Update index

    const currentIndex = pages.indexOf(currentView);
    const nextIndex = (currentIndex + 1) % pages.length; // Use modulus to cycle back to the start

    // Set new view

    if (pages[nextIndex] == "council") {
      toggleOverlay();
    }

    setCurrentView(pages[nextIndex]);
  }

  // Placeholder for goBack function implementation
  function goBack() {}

  function toggleOverlay() {
    setIsOverlayActive(!isOverlayActive);
  }

  return (
    <div className="App" style={backgroundStyle}>
      <Overlay isActive={isOverlayActive && currentView !== "council"}>
        {currentView === "landing" ? (
          <Landing onContinueForward={continueForward} />
        ) : currentView === "welcome" ? (
          <Welcome humanName={humanName} onContinueForward={continueForward} />
        ) : currentView === "topics" ? (
          <Topics onContinueForward={continueForward} />
        ) : currentView === "foods" ? (
          <Foods topic={topic} onContinueForward={continueForward} />
        ) : (
          <div>
            <Navbar topic={topic} onToggleOverlay={toggleOverlay} />
            <Council options={{ humanName, topic, foods }} />
          </div>
        )}
      </Overlay>
    </div>
  );
}

export default App;
