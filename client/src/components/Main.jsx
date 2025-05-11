import "../App.css";
import React, { useState, useEffect, useRef } from "react";
import { Routes, Route, useLocation, useNavigate } from "react-router-dom";
import Test from "./Test.jsx";
import Overlay from "./Overlay";
import MainOverlays from "./MainOverlays";
import Landing from "./settings/Landing";
import Navbar from "./Navbar";
import SelectTopic from "./settings/SelectTopic";
import SelectFoods from "./settings/SelectFoods";
import Council from "./Council";
import RotateDevice from "./RotateDevice";
import FullscreenButton from "./FullscreenButton";
import { usePortrait, dvh } from "../utils";
import CouncilError from "./overlays/CouncilError.jsx";
import FoodAnimation from "./FoodAnimation.jsx";

function useIsIphone() {
  const [isIphone, setIsIphone] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    if (/iPhone/.test(userAgent) && !window.MSStream) {
      setIsIphone(true);
    }
  }, []);

  return isIphone;
}

function Main() {
  const [topic, setTopic] = useState({
    title: "",
    prompt: "",
    description: "",
  });
  const [foods, setFoods] = useState([]);
  const [unrecoverabeError, setUnrecoverableError] = useState(false);

  //Had to lift up navbar state to this level to be able to close it from main overlay
  const [hamburgerOpen, setHamburgerOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const isIphone = useIsIphone();
  const isPortrait = usePortrait();

  function continueForward(fromPage, props) {
    let next = "";
    if (fromPage === "landing") {
      next = "topics";
    } else if (fromPage === "topic") {
      setTopic(props.topic);
      next = "beings";
    } else if (fromPage === "beings") {
      setFoods(props.foods);
      next = "meeting/new";
    }

    navigate(next);
  }

  function onReset(resetData) {
    setFoods([]);

    if (!resetData?.topic) {
      // Reset from the start
      setTopic({ title: "", prompt: "", description: "" });
      navigate("/");
    } else {
      // Reset from foods selection
      setTopic(resetData.topic);
      navigate("beings");
    }
  }

  //Close hamburger when main overlay is closing on mobile
  function onCloseOverlay() {
    setHamburgerOpen(false);
  }

  //Create a special div that covers all click events that are not on the menu
  //If this is clicked, then menu is closed
  const hamburgerCloserStyle = {
    position: "absolute",
    width: "100%",
    height: "100%",
    left: "0",
    top: "0",
    pointerEvents: "auto",
    zIndex: "9",
  };

  const unit = {
    display: "flex",
    justifyContent: "center",
    alignItems: "center"
  };

  const tall = {
    ...unit,
    gridColumn: "span 1",
    gridRow: "span 2",
  };

  const wide = {
    ...unit,
    gridRow: "span 1",
    gridColumn: "span 2",
  };

  const square = {
    ...unit,
    gridRow: "span 1",
    gridColumn: "span 1",
  }

  const double = {
    ...unit,
    gridRow: "span 2",
    gridColumn: "span 2",
  }

  const characters = [
    { ref: useRef(null), name: "Beetle", style: square, },
    { ref: useRef(null), name: "Birch", style: tall },
    { ref: useRef(null), name: "Boletus", style: square },
    { ref: useRef(null), name: "Butterfly", style: square },
    { ref: useRef(null), name: "Flaming Pine", style: square },
    { ref: useRef(null), name: "Flaming Pine2", style: square },
    { ref: useRef(null), name: "Flying Bird", style: double },
    { ref: useRef(null), name: "Insect", style: square },
    { ref: useRef(null), name: "Lichen", style: square },
    { ref: useRef(null), name: "Log", style: double },
    { ref: useRef(null), name: "Mosquito", style: square },
    { ref: useRef(null), name: "Moth", style: wide },
    { ref: useRef(null), name: "Pine", style: tall },
    { ref: useRef(null), name: "Reindeer House", style: double },
    { ref: useRef(null), name: "Reindeer", style: wide },
    { ref: useRef(null), name: "Salmon", style: wide },
    { ref: useRef(null), name: "Saw", style: square },
    { ref: useRef(null), name: "Saw2", style: square },
    { ref: useRef(null), name: "Beetle", style: square },
    { ref: useRef(null), name: "Birch", style: tall },
    { ref: useRef(null), name: "Boletus", style: square },
    { ref: useRef(null), name: "Butterfly", style: square },
    { ref: useRef(null), name: "Beetle", style: square },
    { ref: useRef(null), name: "Birch", style: tall },
    { ref: useRef(null), name: "Boletus", style: square },
    { ref: useRef(null), name: "Butterfly", style: square },
    { ref: useRef(null), name: "Flaming Pine", style: square },
    { ref: useRef(null), name: "Flaming Pine2", style: square },
    { ref: useRef(null), name: "Flying Bird", style: double },
    { ref: useRef(null), name: "Insect", style: square },
    { ref: useRef(null), name: "Lichen", style: square },
    { ref: useRef(null), name: "Log", style: double },
    { ref: useRef(null), name: "Mosquito", style: square },
    { ref: useRef(null), name: "Moth", style: wide },
    { ref: useRef(null), name: "Pine", style: tall },
    { ref: useRef(null), name: "Reindeer House", style: double },
    { ref: useRef(null), name: "Reindeer", style: wide },
    { ref: useRef(null), name: "Salmon", style: wide },
    { ref: useRef(null), name: "Saw", style: square },
    { ref: useRef(null), name: "Saw2", style: square },
    { ref: useRef(null), name: "Beetle", style: square },
    { ref: useRef(null), name: "Birch", style: tall },
    { ref: useRef(null), name: "Boletus", style: square },
    { ref: useRef(null), name: "Butterfly", style: square },
    { ref: useRef(null), name: "Beetle", style: square },
    { ref: useRef(null), name: "Birch", style: tall },
    { ref: useRef(null), name: "Boletus", style: square },
    { ref: useRef(null), name: "Butterfly", style: square },
    { ref: useRef(null), name: "Flaming Pine", style: square },
    { ref: useRef(null), name: "Flaming Pine2", style: square },
    { ref: useRef(null), name: "Flying Bird", style: double },
    { ref: useRef(null), name: "Insect", style: square },
    { ref: useRef(null), name: "Lichen", style: square },
    { ref: useRef(null), name: "Log", style: double },
    { ref: useRef(null), name: "Mosquito", style: square },
    { ref: useRef(null), name: "Moth", style: wide },
    { ref: useRef(null), name: "Pine", style: tall },
    { ref: useRef(null), name: "Reindeer House", style: double },
    { ref: useRef(null), name: "Reindeer", style: wide },
    { ref: useRef(null), name: "Salmon", style: wide },
    { ref: useRef(null), name: "Saw", style: square },
    { ref: useRef(null), name: "Saw2", style: square },
    { ref: useRef(null), name: "Beetle", style: square },
    { ref: useRef(null), name: "Birch", style: tall },
    { ref: useRef(null), name: "Boletus", style: square },
    { ref: useRef(null), name: "Butterfly", style: square },
    { ref: useRef(null), name: "Butterfly", style: square },
    { ref: useRef(null), name: "Beetle", style: square },
    { ref: useRef(null), name: "Birch", style: tall },
    { ref: useRef(null), name: "Boletus", style: square },
    { ref: useRef(null), name: "Butterfly", style: square },
    { ref: useRef(null), name: "Flaming Pine", style: square },
    { ref: useRef(null), name: "Flaming Pine2", style: square },
    { ref: useRef(null), name: "Flying Bird", style: double },
    { ref: useRef(null), name: "Insect", style: square },
    { ref: useRef(null), name: "Lichen", style: square },
    { ref: useRef(null), name: "Log", style: double },
    { ref: useRef(null), name: "Mosquito", style: square },
    { ref: useRef(null), name: "Moth", style: wide },
    { ref: useRef(null), name: "Pine", style: tall },
    { ref: useRef(null), name: "Reindeer House", style: double },
    { ref: useRef(null), name: "Reindeer", style: wide },
    { ref: useRef(null), name: "Salmon", style: wide },
    { ref: useRef(null), name: "Saw", style: square },
    { ref: useRef(null), name: "Saw2", style: square },
    { ref: useRef(null), name: "Beetle", style: square },
    { ref: useRef(null), name: "Birch", style: tall },
  ];

  const containerRef = useRef(null);
  const [randomCharacters, setRandomCharacters] = useState([]);
  const [zoomInValue, setZoomInValue] = useState(1);
  const [offsetValue, setOffsetValue] = useState([0, 0]);
  const [translateValue, setTranslateValue] = useState([0, 0]);

  useEffect(() => {
    let randomizedCharacters = characters.sort(() => 0.5 - Math.random());
    setRandomCharacters(randomizedCharacters);
  }, []);


  return (
    <>
      <Background characters={randomCharacters} zoomInValue={zoomInValue} offsetValue={offsetValue} translateValue={translateValue} containerRef={containerRef} />
      {!unrecoverabeError && (
        <Navbar
          topic={topic.title}
          hamburgerOpen={hamburgerOpen}
          setHamburgerOpen={setHamburgerOpen}
        />
      )}
      {hamburgerOpen && (
        <div
          style={hamburgerCloserStyle}
          onClick={() => setHamburgerOpen(false)}
        ></div>
      )}
      {!unrecoverabeError && (
        <Overlay
          isActive={!location.pathname.startsWith("/meeting")}
          isBlurred={location.pathname !== "/"}
        >
          <Routes>
            <Route
              path="/"
              element={
                <Landing onContinueForward={() => continueForward("landing")} />
              }
            />
            <Route
              path="/test"
              element={<Test />}
            />
            <Route
              path="topics"
              element={
                <SelectTopic
                  onContinueForward={(props) => continueForward("topic", props)}
                />
              }
            />
            <Route
              path="beings"
              element={
                <SelectFoods
                  topic={topic}
                  onContinueForward={(props) => continueForward("beings", props)}
                />
              }
            />
            <Route
              path="meeting/:meetingId"
              element={
                foods.length !== 0 && ( // If page is reloaded, don't even start the council for now
                  <Council
                    topic={topic}
                    foods={foods}
                    characters={randomCharacters}
                    setZoomInValue={setZoomInValue}
                    setOffsetValue={setOffsetValue}
                    setTranslateValue={setTranslateValue}
                    containerRef={containerRef}
                    setUnrecoverableError={setUnrecoverableError}
                  />
                )
              }
            />
          </Routes>
          {!isIphone && <FullscreenButton />}
          <MainOverlays
            topic={topic}
            onReset={onReset}
            onCloseOverlay={onCloseOverlay}
          />
          {isPortrait && location.pathname !== "/" && <RotateOverlay />}
        </Overlay>
      )}
      {unrecoverabeError && (
        <Overlay
          isActive={true}
          isBlurred={true}
        >
          <CouncilError />
        </Overlay>
      )}
    </>
  );
}

export default Main;

function RotateOverlay() {
  return (
    <div
      style={{
        position: "absolute",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
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

function Background({ characters, zoomInValue, offsetValue, translateValue, containerRef }) {

  const container = {
    position: "absolute",
    backgroundColor: "black",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    display: "flex",
    zIndex: "-3",
    transform: `scale(${zoomInValue}) translate(${translateValue[0]}px, ${translateValue[1]}px)`,
    transformOrigin: `${offsetValue[0]}px ${offsetValue[1]}px`,
    transition: "transform 2s ease-out"
  };

  const river = {
    zIndex: "-5",
  };

  const grid = {
    maxWidth: "100%",
    maxHeight: "100%",
    display: "grid",
    margin: "0 auto",
    gridTemplateColumns: "repeat(auto-fill, 75px)",
    gridAutoRows: "75px",
    gridAutoFlow: "row dense",
    gridGap: "0",
    // overflow: "hidden"
  };


  const right = {
    flex: 1
  };



  return (
    <div style={container} ref={containerRef}>
      <div style={{ flex: 1 }}>
        <div style={grid}>
          {characters.slice(0, characters.length / 2).map((character, index) => (
            <div style={character.style} key={index} ref={character.ref}>
              <FoodAnimation
                character={{ name: character.name }}
                styles={{ maxWidth: "100%", maxHeight: "100%" }}
                isPaused={false}
              />
            </div>
          ))}
        </div>
      </div>
      <FoodAnimation character={{ name: "river" }} styles={river} isPaused={false} />
      <div style={{ flex: 1 }}>
        <div style={grid}>
          {characters.slice(characters.length / 2).map((character, index) => (
            <div style={character.style} key={index} ref={character.ref}>
              <FoodAnimation
                character={{ name: character.name }}
                styles={{ maxWidth: "100%", maxHeight: "100%" }}
                isPaused={false}
              />
            </div>
          ))}
        </div>
      </div>
    </div >
  );
}
