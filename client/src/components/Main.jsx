import "../App.css";
import { useState, useEffect } from "react";
import {
  Routes,
  Route,
  useLocation,
  useNavigate
} from "react-router";
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
// import { useTranslation } from 'react-i18next';

//Topics
import topicDataEN from "../prompts/topics_en.json";

const topicsData = {
  "en": topicDataEN
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
  const [participants, setParticipants] = useState([]);
  const [unrecoverabeError, setUnrecoverableError] = useState(false);
  const [connectionError, setConnectionError] = useState(false);

  //Had to lift up navbar state to this level to be able to close it from main overlay
  const [hamburgerOpen, setHamburgerOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const isIphone = useIsIphone();
  const isPortrait = usePortrait();

  // const { i18n } = useTranslation();

  // let { lang } = useParams();
  const lang = 'en';

  useEffect(() => {
    if (chosenTopic.id === undefined && (location.pathname !== "/" && location.pathname !== "/topics")) {
      //Preserve the hash, but navigate to start
      navigate({ pathname: "/", hash: location.hash });
    }
  }, [location.pathname]);


  function topicSelected({ topic, custom }) {
    setChosenTopic({ id: topic, title: topics.find(t => t.id === topic).title });
    if (custom) {
      setCustomTopic(custom);
    }
    navigate(`/foods`);
  }

  function foodsSelected({ foods }) {
    setParticipants(foods);
    proceedToMeeting();
  }

  function letsGo() {
    navigate(`/topics`);
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

    setChosenTopic(copiedTopic);

    //Start the meeting
    navigate(`/meeting/new`);
  }

  function onReset(resetData) {
    setParticipants([]);

    if (!resetData?.topic) {
      // Reset from the start
      setChosenTopic({});
      navigate(`/`);

      //Reload the entire window, in case the frontend has been updated etc.
      //Usefull in exhibition settings where maybe there is no browser access
      window.location.reload();
    } else {
      // Reset from foods selection
      topicSelected(resetData);
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
          topic={chosenTopic.title}
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
                <Landing onContinueForward={letsGo} />
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
              path="foods"
              element={
                <SelectFoods
                  topicTitle={chosenTopic.title}
                  onContinueForward={(props) => foodsSelected(props)}
                />
              }
            />
            <Route
              path="meeting/:meetingId"
              element={
                participants.length !== 0 &&// If page is reloaded, don't even start the council for now
                <Council
                  topic={chosenTopic}
                  participants={participants}
                  setUnrecoverableError={setUnrecoverableError}
                  connectionError={connectionError}
                  setConnectionError={setConnectionError}
                />
              }
            />
          </Routes>
          {!isIphone && <FullscreenButton />}
          <MainOverlays
            topics={topics}
            topic={chosenTopic}
            onReset={onReset}
            onCloseOverlay={onCloseOverlay}
          />
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
