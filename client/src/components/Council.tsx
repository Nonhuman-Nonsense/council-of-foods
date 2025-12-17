import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router";
import FoodItem from "./FoodItem";
import Overlay from "./Overlay";
import CouncilOverlays from "./CouncilOverlays";
import Loading from "./Loading";
import Output from "./Output";
import ConversationControls from "./ConversationControls";
import HumanInput from "./HumanInput";
import { useDocumentVisibility, mapFoodIndex, dvh } from "@/utils";
import routes from "@/routes.json";
import { Character, ConversationMessage, Sentence } from "@shared/ModelTypes";
import { useCouncilMachine } from "@/hooks/useCouncilMachine";
// @ts-ignore
import globalOptions from "@/global-options-client.json";

interface CouncilProps {
  lang: string;
  topic: { prompt: string;[key: string]: any };
  participants: Character[];
  setUnrecoverableError: (error: boolean) => void;
  setConnectionError: (error: boolean) => void;
  connectionError: boolean;
  // Forest-Specific Props:
  audioContext: React.MutableRefObject<AudioContext | null>;
  setAudioPaused: (paused: boolean) => void;
  currentSpeakerId: string;
  setCurrentSpeakerId: (id: string) => void;
  isPaused: boolean;
  setPaused: (paused: boolean) => void;
}

/**
 * Council Component (Forest Version)
 * 
 * Integrated with useCouncilMachine hook.
 * Visuals: Forest (via Output/Props)
 * Logic: Shared Hook
 */
function Council({
  lang,
  topic,
  participants,
  currentSpeakerId,
  setCurrentSpeakerId,
  isPaused,
  setPaused,
  setUnrecoverableError,
  setConnectionError,
  connectionError,
  audioContext,
  setAudioPaused
}: CouncilProps) {

  // Hook Logic
  const { state, actions, socketRef } = useCouncilMachine({
    lang,
    topic,
    participants,
    audioContext,
    setUnrecoverableError,
    setConnectionError,
    connectionError,
    isPaused,
    setPaused,
    setAudioPaused,
    baseUrl: `/${lang}/${routes.meeting}`
  });

  const {
    councilState,
    textMessages,
    audioMessages,
    playingNowIndex,
    playNextIndex,
    activeOverlay,
    summary,
    humanName,
    isRaisedHand,
    currentMeetingId,
    canGoBack,
    canGoForward,
    canRaiseHand,
    currentSnippetIndex,
    sentencesLength,
    isMuted,
    canExtendMeeting,
  } = state;

  const {
    tryToFindTextAndAudio,
    handleOnFinishedPlaying,
    handleOnSkipBackward,
    handleOnSkipForward,
    handleOnSubmitHumanMessage,
    handleOnContinueMeetingLonger,
    handleOnGenerateSummary,
    handleHumanNameEntered,
    handleOnRaiseHand,
    removeOverlay,
    setCurrentSnippetIndex,
    toggleMute,
    setSentencesLength
  } = actions;

  // Routing
  const navigate = useNavigate();
  const location = useLocation();

  // Sync current speaker ID to parent component for Forest zoom
  useEffect(() => {
    // 1. Loading State -> Zoom Out
    if (councilState === 'loading') {
      setCurrentSpeakerId("");
      return;
    }

    // 2. Human Input State (Asking Question) -> Zoom Out
    if (councilState === 'human_input') {
      setCurrentSpeakerId("");
      return;
    }

    // 3. Human Panelist State
    if (councilState === 'human_panelist' && textMessages[playNextIndex]) {
      if (textMessages[playNextIndex].speaker) {
        setCurrentSpeakerId(textMessages[playNextIndex].speaker.toLowerCase());
      }
      return;
    }

    // 4. Summary State -> Zoom Out
    if (councilState === 'summary') {
      setCurrentSpeakerId("");
      return;
    }

    // 5. Playing / Waiting -> Zoom on Speaker
    if (playingNowIndex >= 0 && textMessages[playingNowIndex]) {
      if (textMessages[playingNowIndex].speaker) {
        setCurrentSpeakerId(textMessages[playingNowIndex].speaker.toLowerCase());
      }
    }
  }, [playingNowIndex, textMessages, setCurrentSpeakerId, councilState, playNextIndex]);

  // Derived Visual State (Background Zoom)
  const zoomIn = useMemo(() => {
    if (currentSpeakerId === "") return false;

    // Additional logic for zoom timing (from Forest)
    // If it's pure logic, maybe it should be in hook? 
    // But it depends on `currentSnippetIndex`.
    // Forest: zoomIn if currentSpeakerId is set AND maybe some snippet logic?
    // Looking at original Forest code (inferred):
    if (
      councilState === 'loading' ||
      councilState === 'waiting' ||
      councilState === 'max_reached' ||
      councilState === 'summary' ||
      councilState === 'human_input' ||
      councilState === 'human_panelist' ||
      playingNowIndex <= 0 ||
      textMessages[playingNowIndex]?.type === "human" ||
      textMessages[playingNowIndex]?.type === "panelist"
    ) {
      return false;
    } else if (currentSnippetIndex % 4 < 2 && currentSnippetIndex !== sentencesLength - 1) {
      return true;
    } else {
      return false;
    }
  }, [councilState, playingNowIndex, textMessages, currentSnippetIndex, sentencesLength, currentSpeakerId]);

  const foods = participants.filter((part) => part.type !== 'panelist');

  const currentSpeakerIdx = useMemo(() => {
    let currentIndex;
    foods.forEach((food, index) => {
      if (currentSpeakerId === food.id) {
        currentIndex = mapFoodIndex(foods.length, index);
      }
    });
    return currentIndex;
  }, [foods, currentSpeakerId]);

  const showControls = (
    councilState === 'playing' ||
    councilState === 'waiting' ||
    (councilState === 'summary' && tryToFindTextAndAudio())
  ) ? true : false;

  const isDocumentVisible = useDocumentVisibility();

  useEffect(() => {
    if (!isDocumentVisible && !isPaused) {
      setPaused(true);
    }
  }, [isDocumentVisible, isPaused]);


  return (
    <>
      <MemoizedBackground
        zoomIn={zoomIn}
        currentSpeakerIndex={currentSpeakerIdx}
        totalSpeakers={foods.length - 1}
      />
      <div style={{
        position: "absolute",
        top: "62%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: participants.length > 6 ? "79%" : "70%",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
      }}>
        {foods.map((food, index) => (
          <FoodItem
            key={food.id}
            food={food}
            index={mapFoodIndex(foods.length, index)}
            total={foods.length}
            isPaused={isPaused}
            zoomIn={zoomIn}
            currentSpeakerId={currentSpeakerId}
          />
        ))}
      </div>
      {councilState === 'loading' && <Loading />}
      <>
        {(councilState === 'human_input' || councilState === 'human_panelist') && (
          <HumanInput socketRef={socketRef} isPanelist={(councilState === 'human_panelist')} currentSpeakerName={participants.find(p => p.id === currentSpeakerId)?.name || ""} onSubmitHumanMessage={handleOnSubmitHumanMessage} />
        )}
        <Output
          textMessages={textMessages}
          audioMessages={audioMessages}
          playingNowIndex={playingNowIndex}
          councilState={councilState}
          isMuted={isMuted}
          isPaused={isPaused}
          currentSnippetIndex={currentSnippetIndex}
          setCurrentSnippetIndex={setCurrentSnippetIndex}
          audioContext={audioContext}
          handleOnFinishedPlaying={handleOnFinishedPlaying}
          setSentencesLength={setSentencesLength}
        />
      </>
      {showControls && (
        <ConversationControls
          onSkipBackward={handleOnSkipBackward}
          onSkipForward={handleOnSkipForward}
          onRaiseHand={handleOnRaiseHand}
          isRaisedHand={isRaisedHand}
          isWaitingToInterject={isRaisedHand && councilState !== 'human_input'}
          isMuted={isMuted}
          onMuteUnmute={toggleMute}
          isPaused={isPaused}
          onPausePlay={() => setPaused(!isPaused)}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          canRaiseHand={canRaiseHand}
          onTopOfOverlay={activeOverlay === "summary" && location.hash === ""}
          humanName={humanName}
        />
      )}
      <Overlay isActive={activeOverlay !== null}>
        {activeOverlay !== null && (
          <CouncilOverlays
            activeOverlay={activeOverlay as any}
            onContinue={handleOnContinueMeetingLonger}
            onWrapItUp={handleOnGenerateSummary}
            proceedWithHumanName={handleHumanNameEntered}
            canExtendMeeting={canExtendMeeting}
            removeOverlay={removeOverlay}
            summary={{ text: summary?.text || "" }}
            meetingId={currentMeetingId || ""}
            participants={participants}
          />
        )}
      </Overlay>
    </>
  );
}

export function Background({ zoomIn, currentSpeakerIndex, totalSpeakers }) {
  function calculateBackdropPosition() {
    return 10 + (80 * currentSpeakerIndex) / totalSpeakers + "%";
  }

  const closeUpBackdrop = {
    backgroundImage: `url(/backgrounds/close-up-backdrop.webp)`,
    backgroundSize: "cover",
    backgroundPosition: calculateBackdropPosition(),
    height: "100%",
    width: "100%",
    position: "absolute" as "absolute",
    opacity: zoomIn ? "1" : "0",
  };

  const closeUpTable = {
    backgroundImage: `url(/backgrounds/close-up-table.webp)`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    height: "100%",
    width: "100%",
    position: "absolute" as "absolute",
    opacity: zoomIn ? "1" : "0",
  };

  const bottomShade = {
    width: "100%",
    height: "40%",
    position: "absolute" as "absolute",
    bottom: "0",
    background: "linear-gradient(0, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0) 100%)",
    zIndex: "1",
  };

  const topShade = {
    width: "100%",
    height: "10%",
    position: "absolute" as "absolute",
    top: "0",
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0) 100%)",
    zIndex: "1",
  };

  return (
    <>
      <div style={closeUpBackdrop} />
      <div style={closeUpTable} />
      <div style={bottomShade} />
      <div style={topShade} />
    </>
  );
}

const MemoizedBackground = React.memo(Background);

export default Council;
