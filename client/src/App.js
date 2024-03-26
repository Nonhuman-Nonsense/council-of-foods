import "./App.css";
import React, { useState } from "react";
import Overlay from "./components/Overlay";
import Landing from "./components/Landing";
import Welcome from "./components/Welcome";
import Topics from "./components/Topics";
import Foods from "./components/Foods";
import Navbar from "./components/Navbar";
import Council from "./components/Council";

function App() {
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [foods, setFoods] = useState([]);
  const pages = ["landing", "welcome", "issues", "foods", "council"];
  const [currentView, setCurrentView] = useState(pages[0]);
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

  function continueForward(props) {
    if (props && props.hasOwnProperty("name")) {
      setName(props.name);
    } else if (
      props &&
      props.hasOwnProperty("topic") &&
      props.hasOwnProperty("foods")
    ) {
      setTopic(props.topic);
      setFoods(props.Foods);
    }

    const currentIndex = pages.indexOf(currentView);
    const nextIndex = (currentIndex + 1) % pages.length; // Use modulus to cycle back to the start
    setCurrentView(pages[nextIndex]);
  }

  // Placeholder for goBack function implementation

  return (
    <div className="App" style={backgroundStyle}>
      <Overlay isActive={isActive}>
        {currentView === pages[0] ? (
          <Landing onContinueForward={continueForward} />
        ) : currentView === pages[1] ? (
          <Welcome onContinueForward={continueForward} />
        ) : currentView === pages[2] ? (
          <Topics onContinueForward={continueForward} />
        ) : currentView === pages[3] ? (
          <Foods onContinueForward={continueForward} />
        ) : (
          <div>
            <Navbar topic={topic} />
            <Council options={{ name, topic, foods }} />
          </div>
        )}
      </Overlay>
    </div>
  );
}

export default App;
