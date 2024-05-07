import "./App.css";
import React, { useState, useEffect } from "react";
import Overlay from "./components/Overlay";
import Landing from "./components/settings/Landing";
import Welcome from "./components/settings/Welcome";
import SelectTopic from "./components/settings/SelectTopic";
import SelectFoods from "./components/settings/SelectFoods";
import Council from "./components/Council";

function App() {
  const [humanName, setHumanName] = useState("");
  const [topic, setTopic] = useState({ title: "", prompt: "" });
  const [foods, setFoods] = useState([]);
  const pages = ["landing", "welcome", "topics", "foods", "council"];
  const [currentView, setCurrentView] = useState(pages[0]);
  const [isActiveOverlay, setIsActiveOverlay] = useState(true);

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

  function reset(topic) {
    setTopic(topic ?? { title: "", prompt: "" });
    setFoods([]);
    setIsActiveOverlay(true);

    if (!topic?.title) {
      // Reset from the start
      setHumanName("");
      setCurrentView("landing");
    } else {
      // Reset from foods selection
      setCurrentView("foods");
    }
  }

  return (
    <div className="App">
      <>
      <Background currentView={currentView}/>
      <Overlay isActive={isActiveOverlay && currentView !== "council"} isBlurred={currentView != "landing"}>
        {currentView === "landing" && <Landing onContinueForward={continueForward} />}
        {currentView === "welcome" && <Welcome humanName={humanName} onContinueForward={continueForward} />}
        {currentView === "topics" && <SelectTopic onContinueForward={continueForward} />}
        {currentView === "foods" && <SelectFoods topic={topic} onContinueForward={continueForward} />}
        {currentView === "council" && <Council options={{ humanName, topic, foods, onReset: reset}} />}
      </Overlay>
      </>
    </div>
  );
}

function Background({currentView}) {

    const sharedStyle = {
      backgroundSize: "cover",
      backgroundPositionX: "50%",
      height: "100vh",
      width: "100vw",
      position: "absolute",
    };

    const zoomedOutStyle = {
      ...sharedStyle,
      backgroundPositionY: "50%",
      backgroundImage: `url(/images/backgrounds/zoomed-out.webp)`,
      zIndex: "-2",
      opacity: (currentView != "council" ? "1" : "0")
    };

    const zoomedInStyle = {
      ...sharedStyle,
      backgroundPositionY: "calc(50% + 12vh)",
      backgroundImage: `url(/images/backgrounds/zoomed-in.webp)`,
      zIndex: "-1",
      opacity: (currentView != "council" ? "0.01" : "1")
    };

  return (
    <>
      <div style={zoomedOutStyle} />
      <div style={zoomedInStyle} />
    </>
  );
}

export default App;
