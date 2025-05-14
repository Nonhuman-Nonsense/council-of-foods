import "../App.css";
import React, { useState, useEffect } from "react";
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
import { usePortrait } from "../utils";
import CouncilError from "./overlays/CouncilError.jsx";
import Forest from './Forest';

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

  const [currentSpeakerName, setCurrentSpeakerName] = useState("");

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


  return (
    <>
      <Forest currentSpeakerName={currentSpeakerName} />
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
                    currentSpeakerName={currentSpeakerName}
                    setCurrentSpeakerName={setCurrentSpeakerName}
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
