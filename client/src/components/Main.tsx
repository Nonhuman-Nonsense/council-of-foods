import type { Character } from "@shared/ModelTypes";
import "@root/App.css";
import React, { useState, useEffect } from "react";
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
import SelectTopic, { Topic } from "./settings/SelectTopic";
import SelectFoods, { Food } from "./settings/SelectFoods";
import Council from "./Council";
import RotateDevice from "./RotateDevice";
import FullscreenButton from "./FullscreenButton";
import { usePortrait, dvh } from "@/utils";
import CouncilError from "./overlays/CouncilError.jsx";
import Reconnecting from "./overlays/Reconnecting.jsx";
// import { useTranslation } from 'react-i18next';

//Topics
import topicDataEN from "@prompts/topics_en.json";
import routes from "@/routes.json"; // Import routes directly


// interface Topic removed, imported from SelectTopic

interface TopicsData {
  topics: Topic[];
  system: string;
}

const topicsData: Record<string, TopicsData> = {
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

/**
 * Main Component
 * 
 * Top-level application container. Manages global processing state and routing between setup phases.
 * 
 * Core Logic:
 * - **Setup Flow**: Landing -> Topics -> Foods -> Meeting.
 * - **State Management**: Lifts state up for `chosenTopic` and `participants` to persist across setup routes.
 * - **Error Handling**: renders global error overlays for connection issues.
 * - **Responsiveness**: Handles background zooming and device rotation logic.
 * 
 * @param {Object} props
 * @param {string} props.lang - Active language code.
 */
interface MainProps {
  lang: string;
}

function Main({ lang }: MainProps) {
  const [topics, setTopics] = useState<Topic[]>(topicsData['en'].topics);
  const [chosenTopic, setChosenTopic] = useState<Topic>({ id: "", title: "" });
  const [customTopic, setCustomTopic] = useState("");
  const [participants, setParticipants] = useState<Character[]>([]);
  const [unrecoverabeError, setUnrecoverableError] = useState(false);
  const [connectionError, setConnectionError] = useState(false);

  //Had to lift up navbar state to this level to be able to close it from main overlay
  const [hamburgerOpen, setHamburgerOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const isIphone = useIsIphone();
  const isPortrait = usePortrait();

  // const { i18n } = useTranslation();

  useEffect(() => {
    if (!chosenTopic.id && (location.pathname !== "/" && location.pathname !== "/topics")) {
      //Preserve the hash, but navigate to start
      navigate({ pathname: "/", hash: location.hash });
    }
  }, [location.pathname]);


  function topicSelected({ topic, custom }: { topic: string; custom?: string }) {
    const found = topics.find(t => t.id === topic);
    setChosenTopic({ id: topic, title: found?.title || "" });
    if (custom) {
      setCustomTopic(custom);
    }
    navigate(`/${routes.foods}`);
  }

  function foodsSelected({ foods }: { foods: Food[] }) {
    // Convert Food[] to Character[] by ensuring all required properties are present
    const participants: Character[] = foods.map(food => ({
      ...food,
      voice: food.voice, // Voice is now strictly required by Character type and Food type
      type: food.type || "food" // Ensure type is set
    })) as Character[];

    setParticipants(participants);
    proceedToMeeting();
  }

  function letsGo() {
    navigate(`/${routes.topics}`);
  }

  function proceedToMeeting() {
    //After this, the language cannot be changed anymore

    const foundTopic = topics.find(t => t.id === chosenTopic.id);
    if (!foundTopic) return;

    let copiedTopic = structuredClone(foundTopic);
    if (copiedTopic.id === "customtopic") {
      copiedTopic.prompt = customTopic;
      copiedTopic.description = customTopic;
    }

    if (copiedTopic.prompt) {
      copiedTopic.prompt = topicsData[lang].system.replace(
        "[TOPIC]",
        copiedTopic.prompt
      );
    }

    setChosenTopic(copiedTopic);

    //Start the meeting
    //Start the meeting
    navigate(`/${routes.meeting}/new`);
  }

  function onReset(resetData?: { topic: string; custom?: string }) {
    setParticipants([]);

    if (!resetData?.topic) {
      // Reset from the start
      setChosenTopic({ id: "", title: "" });
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
  const hamburgerCloserStyle: React.CSSProperties = {
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
          lang={lang}
          topic={chosenTopic.title}
          hamburgerOpen={hamburgerOpen}
          setHamburgerOpen={setHamburgerOpen}
        />
      }
      {hamburgerOpen && <div style={hamburgerCloserStyle} onClick={() => setHamburgerOpen(false)}></div>}
      {!unrecoverabeError &&
        <Overlay
          isActive={!location.pathname.startsWith(`/${routes.meeting}`)}
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
              path={routes.topics}
              element={
                <SelectTopic
                  topics={topics}
                  onContinueForward={(props) => topicSelected(props)}
                  onReset={() => { }}
                  onCancel={() => { }}
                />
              }
            />
            <Route
              path={routes.foods}
              element={
                <SelectFoods
                  lang={lang}
                  topicTitle={chosenTopic.title}
                  onContinueForward={(props) => foodsSelected(props)}
                />
              }
            />
            <Route
              path={`${routes.meeting}/:meetingId`}
              element={
                participants.length !== 0 &&// If page is reloaded, don't even start the council for now
                <Council
                  lang={lang}
                  topic={{ ...chosenTopic, prompt: chosenTopic.prompt || "" }}
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

function Background({ path }: { path: string }) {

  const sharedStyle: React.CSSProperties = {
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
    opacity: path.startsWith(`/${routes.meeting}`) ? "0" : "1",
  };

  const zoomedInStyle = {
    ...sharedStyle,
    backgroundPositionY: `calc(50% + max(12${dvh},36px))`,// 50% is picture height, 12vh is from view, 36 is 12% of 300px which is minimum view
    backgroundImage: `url(/backgrounds/zoomed-in.webp)`,
    zIndex: "-1",
    opacity: path.startsWith(`/${routes.meeting}`) ? "1" : "0.01",
  };

  return (
    <>
      <div style={zoomedOutStyle} />
      <div style={zoomedInStyle} />
    </>
  );
}
