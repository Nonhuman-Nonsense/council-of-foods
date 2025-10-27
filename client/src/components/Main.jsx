import "../App.css";
import { useState, useEffect } from "react";
import { Routes, Route, useLocation, useNavigate, useParams } from "react-router";
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
import Reconnecting from "./overlays/Reconnecting.jsx";
import { useTranslation } from 'react-i18next';

//Topics
import topicDataEN from "../prompts/topics.json";
import topicDataSV from "../prompts/topics_sv.json";

const topicsData = {
  "en": topicDataEN,
  "sv": topicDataSV
};

//Freeze original topicData to make it immutable
Object.freeze(topicsData);
for (const language in topicsData) {
  for (let i = 0; i < topicsData[language].topics.length; i++) {
    Object.freeze(topicsData[language].topics[i]);
  }
}

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
  const [topics, setTopics] = useState(topicsData['en'].topics);
  const [chosenTopic, setChosenTopic] = useState({});
  const [customTopic, setCustomTopic] = useState("");
  const [foods, setFoods] = useState([]);
  const [unrecoverabeError, setUnrecoverableError] = useState(false);
  const [connectionError, setConnectionError] = useState(false);

  //Had to lift up navbar state to this level to be able to close it from main overlay
  const [hamburgerOpen, setHamburgerOpen] = useState(false);

  //Council variables moved up to this level, so that the background can access them
  const [currentSpeakerName, setCurrentSpeakerName] = useState("");
  const [isPaused, setPaused] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const isIphone = useIsIphone();
  const isPortrait = usePortrait();

  const { i18n } = useTranslation();

  let { lang } = useParams();

  //Update topics on language change
  useEffect(() => {
    setTopics(topicsData[lang].topics);

    // Update the chosen topic if language changes later
    if (chosenTopic.id) {
      setChosenTopic(prev => {
        prev.title = topicsData[lang].topics.find(t => t.id === chosenTopic.id).title
        return prev;
      });
    }
  }, [lang]);

  //Set language if changed
  //Redirect if unsupported language
  useEffect(() => {
    const supportedLangs = ['sv', 'en'];
    if (supportedLangs.includes(lang)) {
      i18n.changeLanguage(lang);
    } else {
      navigate('/');
    }
  }, [lang]);


  useEffect(() => {
    if (chosenTopic.title === "" && (location.pathname.length > 4 && location.pathname.substring(4) !== "" && location.pathname.substring(4) !== "topics")) {
      //Preserve the hash, but navigate to start
      navigate({ pathname: `/${lang}/`, hash: location.hash });
    }
  }, [location.pathname]);

  function topicSelected({ topic, custom }) {
    setChosenTopic({ id: topic, title: topics.find(t => t.id === topic).title });
    if (custom) {
      setCustomTopic(custom);
    }
    navigate(`/${lang}/beings`);
  }

  function beingsSelected({ foods }) {
    setFoods(foods);
    proceedToMeeting();
  }

  function proceedToMeeting() {
    //After this, the language cannot be changed anymore

    //We need to make a structuredClone here, otherwise we just end up with a string of pointers that ends up mutating the original topicData.
    let copiedTopic = structuredClone(topics.find(t => t.id === chosenTopic.id));
    if (copiedTopic.id === "customtopic") {
      copiedTopic.prompt = customTopic;
      copiedTopic.description = customTopic;
    }

    copiedTopic.prompt = topicsData[lang].system.replace(
      "[TOPIC]",
      copiedTopic.prompt
    );

    console.log(copiedTopic);
    setChosenTopic(copiedTopic);

    //Start the meeting
    navigate(`/${lang}/meeting/new`);
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
      <Forest currentSpeakerName={currentSpeakerName} isPaused={isPaused} />
      <div style={{ width: "100%", height: "7%", minHeight: 300 * 0.07 + "px", position: "absolute", bottom: 0, background: "linear-gradient(0deg, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0) 100%)", zIndex: 1 }} />
      {!(unrecoverabeError || connectionError) && (
        <Navbar
          topic={chosenTopic.title}
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
          isActive={!location.pathname.startsWith(`/${lang}/meeting`)}
          isBlurred={location.pathname !== `/${lang}/`}
        >
          <Routes>
            <Route
              path="/"
              element={
                <Landing onContinueForward={() => navigate(`/${lang}/topics`)} />
              }
            />
            <Route
              path="topics"
              element={
                <SelectTopic
                  topics={topics}
                  onContinueForward={(props) => topicSelected(props)}
                />
              }
            />
            <Route
              path="beings"
              element={
                <SelectFoods
                  topicTitle={chosenTopic.title}
                  onContinueForward={(props) => beingsSelected(props)}
                />
              }
            />
            <Route
              path="meeting/:meetingId"
              element={
                foods.length !== 0 && ( // If page is reloaded, don't even start the council for now
                  <Council
                    topic={chosenTopic}
                    foods={foods}
                    setCurrentSpeakerName={setCurrentSpeakerName}
                    isPaused={isPaused}
                    setPaused={setPaused}
                    setUnrecoverableError={setUnrecoverableError}
                    connectionError={connectionError}
                    setConnectionError={setConnectionError}
                  />
                )
              }
            />
          </Routes>
          {!isIphone && <FullscreenButton />}
          <MainOverlays
            topic={chosenTopic}
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
