import "./App.css";
import React, { useState } from "react";
import Overlay from "./components/Overlay";
import Welcome from "./components/Welcome";
import Setup from "./components/Setup";
import backgroundImage from "./images/council-of-foods-background.jpg";

function App() {
  const [currentView, setCurrentView] = useState("welcome"); // "welcome" or "setup"

  const backgroundStyle = {
    backgroundImage: `url(${backgroundImage})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    height: "100vh",
    width: "100vw",
  };

  const enterSetup = () => {
    setCurrentView("setup");
  };

  return (
    <div
      className="App"
      style={backgroundStyle}
    >
      <Overlay>
        {currentView === "welcome" ? (
          <Welcome onEnterSetup={enterSetup} />
        ) : (
          <Setup />
        )}
      </Overlay>
    </div>
  );
}

export default App;
