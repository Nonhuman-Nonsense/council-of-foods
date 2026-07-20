import "@/App.css";
import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
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
import { useMeetingSetupStore } from "@newMeeting/meetingSetupStore";
import MeetingSetupShell from "@newMeeting/MeetingSetupShell";
import NewMeeting from "@newMeeting/NewMeeting";
import Council from "@council/Council";
import {
  isMeetingPath,
  isRootPath,
  reloadApp,
  stripLanguagePrefix,
  useRouting,
} from "@/navigation";
import RotateDevice from "./overlay/RotateDevice";
import FullscreenButton from "./FullscreenButton";
import MuseumSwitchButton from "@/museum/MuseumSwitchButton";
import { useButtonLedDebugOverlay } from "@/museum/button/buttonDebug";
import { useCouncilSettings } from "@/settings/councilSettings";
import { createAudioContext, useAudioSuspended } from "@/audio/audioContext";
import { useWakeLock } from "@/audio/wakeLock";
import { usePortrait, dvh } from "@/utils";
import CouncilError from "./overlay/CouncilError";
import ErrorBoundary from "./ErrorBoundary";
import Reconnecting from "./overlay/Reconnecting";
import { useErrorStore } from "./overlay/errorStore";

import MuseumButton from "@/museum/button/MuseumButton";
import ButtonBanner from "@/museum/button/ButtonBanner";
import { useMuseumCursorHide } from "@/museum/useMuseumCursorHide";

const AutoplayCoordinator = lazy(() => import("@/autoplay/AutoplayCoordinator"));
import { useAutoplayStore } from "@/autoplay/autoplayStore";

import { z } from "@/zIndexLayers";
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
  
  const connectionError = useErrorStore((s) => s.connectionError);
  const unrecoverableError = useErrorStore((s) => s.unrecoverableError);
  const [meetingliveKey, setMeetingliveKey] = useState<string | null>(null);

  //Had to lift up navbar state to this level to be able to close it from main overlay
  const [hamburgerOpen, setHamburgerOpen] = useState(false);

  // Meeting runtime lifted to Main for Forest: `Forest` mounts as a sibling outside the
  // routed Council tree and needs the same speaker + pause + audio bus while a meeting plays.
  // Foods reads these only via Council props today; do not lift meta-agent state here —
  // `metaAgentPhase` lives in Council (FoodsCouncilScene zoom + MeetingMetaAgent).
  const [currentSpeakerId, setCurrentSpeakerId] = useState("");
  const [isPaused, setPaused] = useState(false);
  const audioContext = useRef<AudioContext | null>(null);

  if (audioContext.current === null) {
    audioContext.current = createAudioContext();
  }

  useAudioSuspended(audioContext, isPaused);
  const { i18n } = useTranslation();
  const { rootPath, newMeetingPath } = useRouting();
  const location = useLocation();
  const navigate = useNavigate();
  useWakeLock(isMeetingPath(location.pathname) && !isPaused);
  const isIphone = useIsIphone();
  const isPortrait = usePortrait();
  const { isMuseumMode, agentMode, museumSwitchButtonEnabled } = useCouncilSettings();
  const meetingGeneration = useAutoplayStore((s) => s.meetingGeneration);
  const { ledDebugOverlay } = useButtonLedDebugOverlay();
  useMuseumCursorHide();

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

  function onReset(resetTopic?: Topic) {
    //If resetting completely
    if (!resetTopic) {
      useMeetingSetupStore.getState().resetStore();
      void reloadApp();
      return;
    }

    //If resetting to a specific topic
    useMeetingSetupStore.getState().resetStore();
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
    zIndex: z.hamburgerBlocker,
  };

  return (
    <>
      {isMuseumMode && (
        <Suspense fallback={null}>
          <AutoplayCoordinator
            meetingliveKey={meetingliveKey}
            setMeetingliveKey={setMeetingliveKey}
          />
        </Suspense>
      )}
      {agentMode === "ptt" && <MuseumButton />}
      {!isMeetingPath(location.pathname) && <ButtonBanner />}
      <Background pathname={location.pathname} />
      {!(unrecoverableError != null || connectionError) && !isMuseumMode &&
        <Navbar
          topicTitle={topicSelection?.title || ""}
          hamburgerOpen={hamburgerOpen}
          setHamburgerOpen={setHamburgerOpen}
        />
      }
      {hamburgerOpen && !isMuseumMode && <div style={hamburgerCloserStyle} onClick={() => setHamburgerOpen(false)}></div>}
      {museumSwitchButtonEnabled && <MuseumSwitchButton />}
      {unrecoverableError == null &&
        <Overlay
          isActive={!isMeetingPath(location.pathname)}
          isBlurred={!isRootPath(location.pathname)}
        >
          <ErrorBoundary>
            <Routes>
              <Route
                element={
                  <MeetingSetupShell
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
                    key={`${stripLanguagePrefix(location.pathname)}@${meetingGeneration}`}
                    topic={topicSelection}
                    setTopic={setTopicSelection}
                    liveKey={meetingliveKey}
                    setliveKey={setMeetingliveKey}
                    currentSpeakerId={currentSpeakerId}
                    setCurrentSpeakerId={setCurrentSpeakerId}
                    isPaused={isPaused}
                    setPaused={setPaused}
                    audioContext={audioContext}
                  />
                }
              />
              <Route path="*" element={<Navigate to={rootPath} replace />} />
            </Routes>
          </ErrorBoundary>
          {!isIphone && !isMuseumMode && !(agentMode === "ptt" && ledDebugOverlay) && <FullscreenButton />}
          {isPortrait && location.pathname !== "/" && <RotateOverlay />}
        </Overlay>
      }
      {unrecoverableError != null && (
        <Overlay isActive={true} isBlurred={true} layer="system">
          <CouncilError error={unrecoverableError} />
        </Overlay>
      )}
      {connectionError && unrecoverableError == null && (
        <Overlay
          isActive={true}
          isBlurred={true}
          layer="system"
        >
          <Reconnecting />
        </Overlay>
      )}
      <MainOverlays
        topic={topicSelection}
        onReset={onReset}
        onCloseOverlay={onCloseOverlay}
      />
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
        zIndex: z.rotatePrompt,
      }}
    >
      <Overlay
        isActive={true}
        isBlurred={true}
        layer="system"
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
    zIndex: z.backgroundZoomedOut,
    opacity: isMeetingPath(pathname) ? "0" : "1",
  };

  const zoomedInStyle = {
    ...sharedStyle,
    backgroundPositionY: `calc(50% + max(12${dvh},36px))`,// 50% is picture height, 12vh is from view, 36 is 12% of 300px which is minimum view
    backgroundImage: `url(${backgroundImageUrls.zoomedIn})`,
    zIndex: z.backgroundZoomedIn,
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
