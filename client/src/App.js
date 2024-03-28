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
  const [isActiveOverlay, setIsActiveOverlay] = useState(true);
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
    if (currentView === "landing") {
      setBackgroundImageURL("/images/backgrounds/zoomed-out.jpeg");
    } else {
      setBackgroundImageURL("/images/backgrounds/zoomed-in.png");
    }
  }, [currentView]);

  function continueForward(props) {
    if (props && props.hasOwnProperty("humanName")) {
      setHumanName(props.humanName);
    } else if (props && props.hasOwnProperty("topic")) {
      setTopic(props.topic);
    } else if (props && props.hasOwnProperty("foods")) {
      setFoods(props.foods);
    }

    const currentIndex = pages.indexOf(currentView);
    const nextIndex = (currentIndex + 1) % pages.length;

    if (pages[nextIndex] === "council") {
      setIsActiveOverlay(false);
    }

    setCurrentView(pages[nextIndex]);
  }

  function changeSettings() {
    // TODO: Restart discussion
    setIsActiveOverlay(true);
    setCurrentView("foods");
  }

  return (
    <div className="App" style={backgroundStyle}>
      <Overlay isActive={isActiveOverlay && currentView !== "council"}>
        {currentView === "landing" ? (
          <Landing onContinueForward={continueForward} />
        ) : currentView === "welcome" ? (
          <Welcome humanName={humanName} onContinueForward={continueForward} />
        ) : currentView === "topics" ? (
          <Topics onContinueForward={continueForward} />
        ) : currentView === "foods" ? (
          <Foods topic={topic} onContinueForward={continueForward} />
        ) : (
          <Council
            options={{
              humanName,
              topic,
              foods,
              onChangeSettings: changeSettings,
            }}
          />
        )}
      </Overlay>
    </div>
  );
}

export default App;
