import "../App.css";
import React, { useState, useEffect } from "react";
import {
  Routes,
  Route,
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";
import Overlay from "../components/Overlay";
import Landing from "../components/settings/Landing";
import About from "../components/overlays/About";
import Contact from "../components/overlays/Contact";
import SelectTopic from "../components/settings/SelectTopic";
import SelectFoods from "../components/settings/SelectFoods";
import Council from "../components/Council";
import RotateDevice from "../components/RotateDevice";
import { useMediaQuery } from "react-responsive";
import { useMobile } from "../utils";
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

function Home() {
  const [topic, setTopic] = useState({ title: "", prompt: "" });
  const [foods, setFoods] = useState([]);
  const pages = ["landing", "welcome", "topics", "foods", "council"];
  const [currentView, setCurrentView] = useState(pages[0]);
  const location = useLocation();
  const navigate = useNavigate();
  const isIphone = useIsIphone();

  //Temporarily disabled! Fix again to resovle paths
  // useEffect(() => {
  //   if (topic.title === "" && (location.pathname !== "/") {
  //     setCurrentView("landing");
  //     if (!["/about", "/contact", "/share"].includes(location.pathname)) {
  //       return navigate("/");
  //     }
  //   }
  // }, [humanName, location.pathname, navigate]);

  useEffect(() => {
    // console.log("location: " + location.pathname);
    if (
      location &&
      ["/welcome", "/topics", "/foods", "/"].includes(location.pathname)
    ) {
      setCurrentView(location?.pathname.substring(1) || "landing");
    }
  }, [location]);

  // useEffect(() => {
  //   console.log("view: " + currentView);
  // },[currentView]);

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
      setCurrentView("council");
      next = "meeting/new";
    }

    navigate(next);
  }

  function reset(topic) {    
    setTopic(topic ?? { title: "", prompt: "" });
    setFoods([]);

    if (!topic?.title) {
      // Reset from the start
      navigate("/");
      setCurrentView("landing");
    } else {
      // Reset from foods selection
      navigate("foods");
      setCurrentView("foods");
    }
  }

  return (
    <>
      <Background currentView={currentView} />
      <Overlay
        isActive={currentView !== "council"}
        isBlurred={currentView !== "landing"}
      >
        {currentView !== "council" && (
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
              path="about"
              element={
                <LandedWrapper>
                  <About isSingle />
                </LandedWrapper>
              }
            />
            <Route
              path="contact"
              element={
                <LandedWrapper>
                  <Contact />
                </LandedWrapper>
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
          </Routes>
        )}
        {currentView === "council" && (
          <Council options={{ topic, foods, onReset: reset }} />
        )}
        {!isIphone && <FullscreenButton />}
      </Overlay>
      {isPortrait && currentView !== "landing" && <RotateOverlay />}
    </>
  );
}

export default Home;

function LandedWrapper({ children }) {
  const isMobile = useMobile();
  return (
    <div
      style={{
        height: "100vh",
        overflowY: "auto",
        display: !isMobile && "flex",
      }}
      className="scroll"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div style={{ height: isMobile && "20px" }} />
        <h1>COUNCIL OF FOODS</h1>
        {children}
        <Link to="/">
          <button>Start</button>
        </Link>
        <div style={{ height: isMobile && "20px" }} />
      </div>
    </div>
  );
}

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
