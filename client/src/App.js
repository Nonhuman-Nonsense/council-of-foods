import "./App.css";
import React, { useState } from "react";
import Overlay from "./components/Overlay";
import Welcome from "./components/Welcome";
import Setup from "./components/Setup";
import Council from "./components/Council";

function App() {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [foods, setFoods] = useState([]);
  const [currentView, setCurrentView] = useState("welcome");
  const [backgroundImageURL, setBackgroundImageURL] = useState(
    "/images/welcome-background.jpg"
  );

  const backgroundStyle = {
    backgroundImage: `url(${backgroundImageURL})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    height: "100vh",
    width: "100vw",
  };

  const isActive = currentView !== "council";

  function enterSetup(name) {
    setName(name);
    setCurrentView("setup");
  }

  function enterCouncil(topic, foods) {
    setTopic(topic);
    setFoods(foods);

    setBackgroundImageURL("");

    setCurrentView("council");
  }

  return (
    <div
      className="App"
      style={backgroundStyle}
    >
      <Overlay isActive={isActive}>
        {currentView === "welcome" ? (
          <Welcome onEnterSetup={enterSetup} />
        ) : currentView === "setup" ? (
          <Setup onEnterCouncil={enterCouncil} />
        ) : (
          <Council options={{ name: name, topic: topic, foods: foods }} />
        )}
      </Overlay>
    </div>
  );
}

export default App;
