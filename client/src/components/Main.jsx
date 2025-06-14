import "../App.css";
import React, { useState, useEffect } from "react";
import {
  Routes,
  Route,
  useLocation,
  useNavigate
} from "react-router-dom";
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
import Reconnecting from "./overlays/Reconnecting.jsx";

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
  const [topic, setTopic] = useState({ title: "", prompt: "", description: "" });
  const [foods, setFoods] = useState([]);
  const [unrecoverabeError, setUnrecoverableError] = useState(false);
  const [connectionError, setConnectionError] = useState(false);

  //Had to lift up navbar state to this level to be able to close it from main overlay
  const [hamburgerOpen, setHamburgerOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const isIphone = useIsIphone();
  const isPortrait = usePortrait();

  useEffect(() => {
    if (topic.title === "" && (location.pathname !== "/" && location.pathname !== "/topics")) {
      //Preserve the search, but navigate to start
      navigate({ pathname: "/", search: location.search });
    }
  }, [location.pathname]);



  function continueForward(fromPage, props) {
    let next = "";
    if (fromPage === "landing") {
      next = "topics";
    } else if (fromPage === "topic") {
      setTopic(props.topic);
      next = "foods";
    } else if (fromPage === "foods") {
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
      navigate("foods");
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
    pointerEvents: 'auto',
    zIndex: "9"
  };

  return (
    <>
      <Background path={location.pathname} />
      {!(unrecoverabeError || connectionError) &&
        <Navbar
          topic={topic.title}
          hamburgerOpen={hamburgerOpen}
          setHamburgerOpen={setHamburgerOpen}
        />
      }
      {hamburgerOpen && <div style={hamburgerCloserStyle} onClick={() => setHamburgerOpen(false)}></div>}
      {!unrecoverabeError &&
        <Overlay
          isActive={!location.pathname.startsWith("/meeting")}
          isBlurred={location.pathname !== "/"}
        >
          <Routes>
            <Route
              path="/"
              element={
                <Landing
                  onContinueForward={() => continueForward("landing")}
                />
              }
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
              path="foods"
              element={
                <SelectFoods
                  topic={topic}
                  onContinueForward={(props) => continueForward("foods", props)}
                />
              }
            />
            <Route
              path="meeting/:meetingId"
              element={
                foods.length !== 0 &&// If page is reloaded, don't even start the council for now
                <Council
                  topic={topic}
                  foods={foods}
                  setUnrecoverableError={setUnrecoverableError}
                  connectionError={connectionError}
                  setConnectionError={setConnectionError}
                />
              }
            />
          </Routes>
          {!isIphone && <FullscreenButton />}
          <MainOverlays topic={topic} onReset={onReset} onCloseOverlay={onCloseOverlay} />
          {isPortrait && location.pathname !== "/" && <RotateOverlay />}
        </Overlay>
      }
      {unrecoverabeError &&
        <Overlay isActive={true} isBlurred={true}>
          <CouncilError />
        </Overlay>
      }
      {connectionError && !unrecoverabeError && (
        <Overlay
          isActive={true}
          isBlurred={true}
        >
          <Reconnecting />
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

function Background({ path }) {

  const sharedStyle = {
    backgroundSize: "cover",
    backgroundPositionX: "50%",
    height: "100%",
    width: "100%",
    position: "absolute",
  };

  const zoomedOutStyle = {
    ...sharedStyle,
    backgroundPositionY: "50%",
    backgroundImage: `url(/backgrounds/zoomed-out.webp)`,
    zIndex: "-2",
    opacity: path.startsWith('/meeting') ? "0" : "1",
  };

  const zoomedInStyle = {
    ...sharedStyle,
    backgroundPositionY: `calc(50% + max(12${dvh},36px))`,// 50% is picture height, 12vh is from view, 36 is 12% of 300px which is minimum view
    backgroundImage: `url(/backgrounds/zoomed-in.webp)`,
    zIndex: "-1",
    opacity: path.startsWith('/meeting') ? "1" : "0.01",
  };

  return (
    <>
      <div style={zoomedOutStyle} />
      <div style={zoomedInStyle} />
    </>
  );
}
