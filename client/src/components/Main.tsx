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
import { Topic, TopicSelection } from "./settings/SelectTopic";
import NewMeeting from "./NewMeeting";
import Council from "./Council";
import { getBasePath, isMeetingPath, isRootPath, newMeetingPath } from "@/routing";
import RotateDevice from "./RotateDevice";
import FullscreenButton from "./FullscreenButton";
import { usePortrait, dvh } from "@/utils";
import CouncilError from "./overlays/CouncilError.jsx";
import Reconnecting from "./overlays/Reconnecting.jsx";
// import { useTranslation } from 'react-i18next';

import routes from "@/routes.json";
import { getTopicsBundle } from "@/components/topicsBundle";

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

interface MainProps {
  lang: string;
}

export default function Main(props: MainProps) {
  const topicsBundle = getTopicsBundle(props.lang);
  const topics = topicsBundle.topics;
  const customTopicConfig = topicsBundle.custom_topic;

  const [topicSelection, setTopicSelection] = useState<TopicSelection | null>(null);
  const topicTitle = deriveTopicTitle(topics, customTopicConfig, topicSelection);
  const [unrecoverabeError, setUnrecoverableError] = useState(false);
  const [connectionError, setConnectionError] = useState(false);

  //Had to lift up navbar state to this level to be able to close it from main overlay
  const [hamburgerOpen, setHamburgerOpen] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();
  const isIphone = useIsIphone();
  const isPortrait = usePortrait();

  // const { i18n } = useTranslation();

  const topicForOverlays: Topic = deriveTopicForOverlays(topics, customTopicConfig, topicSelection, topicTitle);

  // If the user navigates back to the landing page, treat it as a fresh start.
  useEffect(() => {
    if (isRootPath(location.pathname)) {
      setTopicSelection(null);
    }
  }, [location.pathname]);

  function onReset(resetData?: { topic: string; custom?: string }) {
    setTopicSelection(resetData ? ({ topic: resetData.topic, custom: resetData.custom ?? "" } satisfies TopicSelection) : null);
    if (!resetData?.topic) {
      navigate(getBasePath(props.lang));

      //Reload the entire window, in case the frontend has been updated etc.
      //Usefull in exhibition settings where maybe there is no browser access
      window.location.reload();
    } else {
      navigate(newMeetingPath(props.lang));
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
      <Background pathname={location.pathname} />
      {!(unrecoverabeError || connectionError) &&
        <Navbar
          lang={props.lang}
          topic={topicTitle}
          hamburgerOpen={hamburgerOpen}
          setHamburgerOpen={setHamburgerOpen}
        />
      }
      {hamburgerOpen && <div style={hamburgerCloserStyle} onClick={() => setHamburgerOpen(false)}></div>}
      {!unrecoverabeError &&
        <Overlay
          isActive={!isMeetingPath(location.pathname)}
          isBlurred={!isRootPath(location.pathname)}
        >
          <Routes>
            <Route
              path="/"
              element={
                <Landing newMeetingPath={newMeetingPath(props.lang)} />
              }
            />
            <Route
              path={routes.newMeeting}
              element={
                <NewMeeting
                  lang={props.lang}
                  setUnrecoverableError={setUnrecoverableError}
                  topicSelection={topicSelection}
                  setTopicSelection={setTopicSelection}
                />
              }
            />
            <Route
              path={`${routes.meeting}/:meetingId`}
              element={
                <Council
                  key={location.pathname}
                  lang={props.lang}
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
            topic={topicForOverlays}
            customTopicConfig={customTopicConfig}
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

function deriveTopicTitle(
  topics: Topic[],
  customTopicConfig: Topic,
  selection: TopicSelection | null
): string {
  if (!selection) return "";
  if (selection.topic === customTopicConfig.id) return selection.custom?.trim() || customTopicConfig.title || "";
  return topics.find((t) => t.id === selection.topic)?.title ?? "";
}

function deriveTopicForOverlays(
  topics: Topic[],
  customTopicConfig: Topic,
  selection: TopicSelection | null,
  fallbackTitle: string
): Topic {
  if (!selection) return { id: "", title: fallbackTitle, prompt: "" };
  if (selection.topic === customTopicConfig.id) {
    return { ...customTopicConfig, description: selection.custom, prompt: selection.custom };
  }
  return topics.find((t) => t.id === selection.topic) ?? { id: selection.topic, title: fallbackTitle, prompt: "" };
}

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

function Background({ pathname }: { pathname: string }) {

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
    opacity: isMeetingPath(pathname) ? "0" : "1",
  };

  const zoomedInStyle = {
    ...sharedStyle,
    backgroundPositionY: `calc(50% + max(12${dvh},36px))`,// 50% is picture height, 12vh is from view, 36 is 12% of 300px which is minimum view
    backgroundImage: `url(/backgrounds/zoomed-in.webp)`,
    zIndex: "-1",
    opacity: isMeetingPath(pathname) ? "1" : "0.01",
  };

  return (
    <>
      <div style={zoomedOutStyle} />
      <div style={zoomedInStyle} />
      {/* Preload Council Backgrounds */}
      <div style={{ backgroundImage: `url(/backgrounds/close-up-backdrop.webp)`, opacity: 0, width: 0, height: 0, position: 'absolute', pointerEvents: 'none' }} />
      <div style={{ backgroundImage: `url(/backgrounds/close-up-table.webp)`, opacity: 0, width: 0, height: 0, position: 'absolute', pointerEvents: 'none' }} />
    </>
  );
}
