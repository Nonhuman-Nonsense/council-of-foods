import "@root/App.css";
import { useState, useEffect, useRef } from "react";
import { getTopicsBundle } from "@/components/topicsBundle";
import { Routes, Route, useLocation, useNavigate } from "react-router";
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
import CouncilError from "./overlays/CouncilError";
import Forest from './Forest';
import Reconnecting from "./overlays/Reconnecting";

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

  // Council variables lifted to this level so the Forest background can access them
  const [currentSpeakerId, setCurrentSpeakerId] = useState("");
  const [isPaused, setPaused] = useState(false);

  const audioContext = useRef<AudioContext | null>(null);
  const [audioPaused, setAudioPaused] = useState(false);

  const { i18n } = useTranslation();
  const { rootPath, newMeetingPath } = useRouting();
  const location = useLocation();
  const navigate = useNavigate();
  const isIphone = useIsIphone();
  const isPortrait = usePortrait();

  if (audioContext.current === null) {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    audioContext.current = new AudioContext();
  }
  
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

    if (isMeetingPath(location.pathname) && meetingCreatorKey) {
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

  // Suspend/resume the shared AudioContext based on audioPaused state
  useEffect(() => {
    if (audioPaused) {
      if (audioContext.current && audioContext.current.state !== "suspended") {
        audioContext.current.suspend();
      }
    } else if (audioContext.current && audioContext.current.state === "suspended") {
      audioContext.current.resume();
    }
  }, [audioPaused]);

  function onReset(resetTopic?: Topic) {
    if (!resetTopic) {
      window.location.href = rootPath;
      return;
    }

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
    pointerEvents: "auto",
    zIndex: "9",
  };


  return (
    <>
      <Forest currentSpeakerId={currentSpeakerId} isPaused={isPaused} audioContext={audioContext} />
      <div style={{ width: "100%", height: "7%", minHeight: 300 * 0.07 + "px", position: "absolute", bottom: 0, background: "linear-gradient(0deg, rgba(0, 0, 0, 0.95) 0%, rgba(0, 0, 0, 0) 100%)", zIndex: 1 }} />
      {!(unrecoverabeError || connectionError) && (
        <Navbar
          topicTitle={topicSelection?.title || ""}
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
                  currentSpeakerId={currentSpeakerId}
                  setCurrentSpeakerId={setCurrentSpeakerId}
                  isPaused={isPaused}
                  setPaused={setPaused}
                  audioContext={audioContext}
                  setAudioPaused={setAudioPaused}
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
