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
import { useMediaQuery } from "react-responsive";
import FullscreenButton from "./FullscreenButton";

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
  const [topic, setTopic] = useState({ title: "", prompt: "" });
  const [foods, setFoods] = useState([]);

  const location = useLocation();
  const navigate = useNavigate();
  const isIphone = useIsIphone();

  useEffect(() => {
    if (topic.title === "" && (location.pathname !== "/" && location.pathname !== "/topics")) {
      //Preserve the search, but navigate to start
      navigate({pathname: "/", search: location.search});      
    }
  }, [location.pathname]);

  const isPortrait = useMediaQuery({ query: "(orientation: portrait)" });

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

  function onReset(topic) {
    setTopic(topic ?? { title: "", prompt: "" });
    setFoods([]);

    if (!topic?.title) {
      // Reset from the start
      navigate("/");
      // setCurrentView("landing");
    } else {
      // Reset from foods selection
      navigate("foods");
      // setCurrentView("foods");
    }
  }

  return (
    <>
      <Background path={location.pathname} />
      <Navbar
        topic={topic.title}
      />
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
              <Council
                topic={topic}
                foods={foods}
                onReset={onReset}
              />
            }
          />
        </Routes>
        {!isIphone && <FullscreenButton />}
        <MainOverlays topic={topic} onReset={onReset} />
        {isPortrait && location.pathname !== "/" && <RotateOverlay />}
      </Overlay>
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

function Background({ path }) {
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
    opacity: path.startsWith('/meeting') ? "0" : "1",
  };

  const zoomedInStyle = {
    ...sharedStyle,
    backgroundPositionY: "calc(50% + 12vh)",
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
