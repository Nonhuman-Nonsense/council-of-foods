import "./App.css";
import React, { useState } from "react";
import Overlay from "./components/Overlay";
import Welcome from "./components/Welcome";
import Setup from "./components/Setup";
import Navbar from "./components/Navbar";
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
    minWidth: "0px",
  };

  const isActive = currentView !== "council";

  function enterSetup(name) {
    setName(name);
    setCurrentView("setup");
  }

  function enterCouncil(topic, foods) {
    setTopic(topic);
    setFoods(foods);

    setBackgroundImageURL("/images/council-background-test.png");

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
          <div>
            <Navbar topic={topic} />
            <Council options={{ name: name, topic: topic, foods: foods }} />
          </div>
        )}
      </Overlay>
    </div>
  );
}

export default App;
