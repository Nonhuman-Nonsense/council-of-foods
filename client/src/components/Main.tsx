import "@root/App.css";
import React, { useState, useEffect } from "react";
import { getTopicsBundle } from "@/components/topicsBundle";
import {
  Routes,
  Route,
  useLocation,
  useNavigate
} from "react-router";
import { useTranslation } from "react-i18next";
import Overlay from "./Overlay";
import MainOverlays from "./MainOverlays";
import Landing from "./settings/Landing";
import Navbar from "./Navbar";
import type { Topic } from "@shared/ModelTypes";
import NewMeeting from "./NewMeeting";
import Council from "./Council";
import { isMeetingPath, isRootPath, stripLanguagePrefix, useRouting } from "@/routing";
import RotateDevice from "./RotateDevice";
import FullscreenButton from "./FullscreenButton";
import { usePortrait, dvh } from "@/utils";
import CouncilError from "./overlays/CouncilError.jsx";
import Reconnecting from "./overlays/Reconnecting.jsx";

import routes from "@/routes.json";

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
  const [topicSelection, setTopicSelection] = useState<Topic | null>(null);
  
  const [unrecoverabeError, setUnrecoverableError] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [meetingCreatorKey, setMeetingCreatorKey] = useState<string | null>(null);

  //Had to lift up navbar state to this level to be able to close it from main overlay
  const [hamburgerOpen, setHamburgerOpen] = useState(false);

  const { i18n } = useTranslation();
  const { rootPath, newMeetingPath } = useRouting();
  const location = useLocation();
  const navigate = useNavigate();
  const isIphone = useIsIphone();
  const isPortrait = usePortrait();

  useEffect(() => {
    i18n.changeLanguage(props.lang);

    if (topicSelection?.id) {
      const bundle = getTopicsBundle(props.lang);
      if (topicSelection.id === 'customtopic') {
        setTopicSelection(prev => prev
          ? { ...prev, title: bundle.custom_topic.title }
          : prev);
      } else {
        const found = bundle.topics.find(t => t.id === topicSelection.id);
        if (found) {
          setTopicSelection(prev => prev
            ? { ...prev, title: found.title, description: found.description, prompt: bundle.system.replace("[TOPIC]", found.prompt) }
            : prev);
        }
      }
    }

    if (isMeetingPath(location.pathname)) {
      navigate({ hash: "warning" });
    }
  }, [props.lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // If the user navigates back to the landing page, treat it as a fresh start.
  useEffect(() => {
    if (isRootPath(location.pathname)) {
      setTopicSelection(null);
    }
  }, [location.pathname]);

  useEffect(() => {
    const withoutLang = stripLanguagePrefix(location.pathname);
    if (withoutLang === `/${routes.newMeeting}` || isRootPath(location.pathname)) {
      setMeetingCreatorKey(null);
    }
  }, [location.pathname]);

  function onReset(resetTopic?: Topic) {
    //If resetting completely
    if (!resetTopic) {
      window.location.href = rootPath;
      return;
    }

    //If resetting to a specific topic
    setTopicSelection(resetTopic);

    navigate({
      pathname: newMeetingPath,
      hash: "",
    });
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
          topicTitle={topicSelection?.title || ""}
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
                <Landing newMeetingPath={newMeetingPath} />
              }
            />
            <Route
              path={routes.newMeeting}
              element={
                <NewMeeting
                  setUnrecoverableError={setUnrecoverableError}
                  topicSelection={topicSelection}
                  setTopicSelection={setTopicSelection}
                  setMeetingCreatorKey={setMeetingCreatorKey}
                />
              }
            />
            <Route
              path={`${routes.meeting}/:meetingId`}
              element={
                <Council
                  key={stripLanguagePrefix(location.pathname)}
                  creatorKey={meetingCreatorKey}
                  setUnrecoverableError={setUnrecoverableError}
                  connectionError={connectionError}
                  setConnectionError={setConnectionError}
                />
              }
            />
          </Routes>
          {!isIphone && <FullscreenButton />}
          <MainOverlays
            topic={topicSelection}
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
