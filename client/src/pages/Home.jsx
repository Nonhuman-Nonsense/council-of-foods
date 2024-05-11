import "../App.css";
import React, { useState, useEffect } from "react";
import Overlay from "../components/Overlay";
import Landing from "../components/settings/Landing";
import Welcome from "../components/settings/Welcome";
import SelectTopic from "../components/settings/SelectTopic";
import SelectFoods from "../components/settings/SelectFoods";
import Council from "../components/Council";
import RotateDevice from "../components/RotateDevice";
import { useMediaQuery } from "react-responsive";
import { useCouncil } from "../components/CouncilContext";

function Home() {
  const [humanName, setHumanName] = useState("");
  const [topic, setTopic] = useState({ title: "", prompt: "" });
  const [foods, setFoods] = useState([]);
  const pages = ["landing", "welcome", "topics", "foods", "council"];
  const [currentView, setCurrentView] = useState(pages[0]);
  const [isActiveOverlay, setIsActiveOverlay] = useState(true);
  const { councilState, setCouncilState } = useCouncil();

  useEffect(() => {
    if (councilState && councilState.initialized && currentView !== "council") {
      // Council state is already initialized... Proceeding to set necessary variables and move to council view
      setHumanName(councilState.humanName);
      setTopic(councilState.topic);
      setFoods(councilState.foods);

      console.log("Moving to council view");
      setCurrentView("council");
    }
  });

  const isPortrait = useMediaQuery({ query: "(orientation: portrait)" });

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
    // Reset council state
    setCouncilState((prev) => {});

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
    <>
      <Background currentView={currentView} />
      <Overlay
        isActive={isActiveOverlay && currentView !== "council"}
        isBlurred={currentView !== "landing"}
      >
        {currentView === "landing" && (
          <Landing onContinueForward={continueForward} />
        )}
        {currentView === "welcome" && (
          <Welcome
            humanName={humanName}
            onContinueForward={continueForward}
          />
        )}
        {currentView === "topics" && (
          <SelectTopic onContinueForward={continueForward} />
        )}
        {currentView === "foods" && (
          <SelectFoods
            topic={topic}
            onContinueForward={continueForward}
          />
        )}
        {currentView === "council" && (
          <Council options={{ humanName, topic, foods, onReset: reset }} />
        )}
      </Overlay>
      {isPortrait && currentView !== "landing" && <RotateOverlay />}
    </>
  );
}

export default Home;

function RotateOverlay() {
  return (
    <div
      style={{
        position: "absolute",
        top: "0",
        left: "0",
        width: "100vw",
        height: "100vh",
        zIndex: "100",
      }}
    >
      <Overlay
        isActive={true}
        isBlurred={true}
      >
        <RotateDevice />
      </Overlay>
    </div>
  );
}

function Background({ currentView }) {
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
    backgroundImage: `url(/backgrounds/zoomed-out.webp)`,
    zIndex: "-2",
    opacity: currentView !== "council" ? "1" : "0",
  };

  const zoomedInStyle = {
    ...sharedStyle,
    backgroundPositionY: "calc(50% + 12vh)",
    backgroundImage: `url(/backgrounds/zoomed-in.webp)`,
    zIndex: "-1",
    opacity: currentView !== "council" ? "0.01" : "1",
  };

  return (
    <>
      <div style={zoomedOutStyle} />
      <div style={zoomedInStyle} />
    </>
  );
}
