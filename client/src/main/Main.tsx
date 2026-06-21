import "@/App.css";
import React, { useState, useEffect, useRef } from "react";
import { getTopicsBundle } from "./topicsBundle";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate
} from "react-router";
import { useTranslation } from "react-i18next";
import Overlay from "./overlay/Overlay";
import MainOverlays from "./overlay/MainOverlays";
import Landing from "@newMeeting/Landing";
import Navbar from "./Navbar";
import type { Topic } from "@shared/ModelTypes";
import { buildTopicFromSelection } from "@newMeeting/meetingSetup";
import MeetingSetupShell from "@newMeeting/MeetingSetupShell";
import NewMeeting from "@newMeeting/NewMeeting";
import Council from "@council/Council";
import { isMeetingPath, isRootPath, stripLanguagePrefix, useRouting } from "@/routing";
import RotateDevice from "./overlay/RotateDevice";
import FullscreenButton from "./FullscreenButton";
import MuseumModeEscapeHatch from "@/museum/MuseumModeEscapeHatch";
import { useAppMode } from "@/museum/useAppMode";
import { usePortrait, dvh } from "@/utils";
import CouncilError from "./overlay/CouncilError";
import Reconnecting from "./overlay/Reconnecting";
import { lazy, Suspense } from "react";

const MuseumButtonRuntime = lazy(() => import("@/museum/button/MuseumButtonRuntime"));

import routes from "@/routes.json";
import { backgroundImageUrls } from "@assets/backgrounds/index";

function useIsIphone() {
  const [isIphone, setIsIphone] = useState(false);

  useEffect(() => {
    const userAgent = String(navigator.userAgent || navigator.vendor || window.opera || "");
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
  
  const [unrecoverableErrorMessage, setUnrecoverableErrorMessage] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [meetingliveKey, setMeetingliveKey] = useState<string | null>(null);

  //Had to lift up navbar state to this level to be able to close it from main overlay
  const [hamburgerOpen, setHamburgerOpen] = useState(false);

  // Keep these at Main level even though Foods currently renders its scene inside Council.
  // Forest needs the same runtime state outside the routed Council tree, and matching that
  // ownership here reduces cross-app merge conflicts when background/audio behavior changes.
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
  const { isMuseumMode } = useAppMode();

  if (audioContext.current === null) {
    type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextCtor =
      window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("Web Audio API is not available in this environment");
    }
    audioContext.current = new AudioContextCtor();
  }

  useEffect(() => {
    if (i18n.language !== props.lang) {
      void i18n.changeLanguage(props.lang);
    }

    if (topicSelection?.id) {
      const bundle = getTopicsBundle(props.lang);
      const isKnownTopic =
        topicSelection.id === bundle.custom_topic.id ||
        bundle.topics.some((topic) => topic.id === topicSelection.id);

      if (isKnownTopic) {
        setTopicSelection(
          buildTopicFromSelection({
            topicsBundle: bundle,
            selectedTopicId: topicSelection.id,
            customTopic:
              topicSelection.id === bundle.custom_topic.id ? (topicSelection.description ?? "") : "",
          }),
        );
      }
    }

    if (isMeetingPath(location.pathname) && meetingliveKey) {
      navigate({ hash: "warning" });
    }
  }, [props.lang]);

  // If the user navigates back to the landing page, treat it as a fresh start.
  useEffect(() => {
    if (isRootPath(location.pathname)) {
      setTopicSelection(null);
    }
  }, [location.pathname]);

  useEffect(() => {
    const withoutLang = stripLanguagePrefix(location.pathname);
    if (withoutLang === `/${routes.newMeeting}` || isRootPath(location.pathname)) {
      setMeetingliveKey(null);
    }
  }, [location.pathname]);

  // Centralize Web Audio suspension here so Council and future scene components can share one
  // AudioContext without each feature trying to suspend/resume it independently.
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
      {isMuseumMode && (
        <Suspense fallback={null}>
          <MuseumButtonRuntime />
        </Suspense>
      )}
      <Background pathname={location.pathname} />
      {!(unrecoverableErrorMessage != null || connectionError) && !isMuseumMode &&
        <Navbar
          topicTitle={topicSelection?.title || ""}
          hamburgerOpen={hamburgerOpen}
          setHamburgerOpen={setHamburgerOpen}
        />
      }
      {hamburgerOpen && !isMuseumMode && <div style={hamburgerCloserStyle} onClick={() => setHamburgerOpen(false)}></div>}
      {isMuseumMode && <MuseumModeEscapeHatch />}
      {unrecoverableErrorMessage == null &&
        <Overlay
          isActive={!isMeetingPath(location.pathname)}
          isBlurred={!isRootPath(location.pathname)}
        >
          <Routes>
            <Route
              element={
                <MeetingSetupShell
                  setUnrecoverableError={setUnrecoverableErrorMessage}
                  topicSelection={topicSelection}
                  setTopicSelection={setTopicSelection}
                  setMeetingliveKey={setMeetingliveKey}
                />
              }
            >
              <Route path="/" element={<Landing />} />
              <Route path={routes.newMeeting} element={<NewMeeting />} />
            </Route>
            <Route
              path={`${routes.meeting}/:meetingId`}
              element={
                <Council
                  key={stripLanguagePrefix(location.pathname)}
                  topic={topicSelection}
                  setTopic={setTopicSelection}
                  liveKey={meetingliveKey}
                  setliveKey={setMeetingliveKey}
                  setUnrecoverableError={setUnrecoverableErrorMessage}
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
            <Route path="*" element={<Navigate to={rootPath} replace />} />
          </Routes>
          {!isIphone && !isMuseumMode && <FullscreenButton />}
          <MainOverlays
            topic={topicSelection}
            onReset={onReset}
            onCloseOverlay={onCloseOverlay}
          />
          {isPortrait && location.pathname !== "/" && <RotateOverlay />}
        </Overlay>
      }
      {unrecoverableErrorMessage != null && (
        <Overlay isActive={true} isBlurred={true}>
          <CouncilError detailMessage={unrecoverableErrorMessage} />
        </Overlay>
      )}
      {connectionError && unrecoverableErrorMessage == null && (
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
    backgroundImage: `url(${backgroundImageUrls.zoomedOut})`,
    zIndex: "-2",
    opacity: isMeetingPath(pathname) ? "0" : "1",
  };

  const zoomedInStyle = {
    ...sharedStyle,
    backgroundPositionY: `calc(50% + max(12${dvh},36px))`,// 50% is picture height, 12vh is from view, 36 is 12% of 300px which is minimum view
    backgroundImage: `url(${backgroundImageUrls.zoomedIn})`,
    zIndex: "-1",
    opacity: isMeetingPath(pathname) ? "1" : "0.01",
  };

  return (
    <>
      <div style={zoomedOutStyle} />
      <div style={zoomedInStyle} />
      {/* Preload Council Backgrounds */}
      <div style={{ backgroundImage: `url(${backgroundImageUrls.closeUpBackdrop})`, opacity: 0, width: 0, height: 0, position: 'absolute', pointerEvents: 'none' }} />
      <div style={{ backgroundImage: `url(${backgroundImageUrls.closeUpTable})`, opacity: 0, width: 0, height: 0, position: 'absolute', pointerEvents: 'none' }} />
    </>
  );
}
