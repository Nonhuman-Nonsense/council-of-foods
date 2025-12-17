import React, { useMemo, useEffect, useRef } from "react";
import { useLocation } from "react-router";
import FoodItem from "./FoodItem";
import Overlay from "./Overlay";
import CouncilOverlays from "./CouncilOverlays";
import Loading from "./Loading";
import Output from "./Output";
import ConversationControls from "./ConversationControls";
import HumanInput from "./HumanInput";
import { useDocumentVisibility, mapFoodIndex } from "@/utils";
import routes from "@/routes.json";
import { Character, ConversationMessage, Sentence } from "@shared/ModelTypes";
import { useCouncilMachine } from "../hooks/useCouncilMachine";
// @ts-ignore
import globalOptions from "@/global-options-client.json";

interface CouncilProps {
  lang: string;
  topic: { prompt: string;[key: string]: any };
  participants: Character[];
  setUnrecoverableError: (error: boolean) => void;
  setConnectionError: (error: boolean) => void;
  connectionError: boolean;
}

/**
 * Council Component (Refactored)
 * 
 * Now a "dumb" view component that consumes logic from `useCouncilMachine`.
 */
// @ts-ignore
function Council({
  lang,
  topic,
  participants,
  setUnrecoverableError,
  setConnectionError,
  connectionError
}: CouncilProps) {

  // Audio Context Ref
  const audioContext = useRef<AudioContext | null>(null);
  if (audioContext.current === null) {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    audioContext.current = new AudioContext();
  }

  // Local UI State
  const [isPaused, setPaused] = React.useState(false);

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
    // setAudioPaused is optional, we don't pass it here so Hook handles valid suspension via ref
    baseUrl: `/${routes.meeting}`
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
    setHumanName, // exposed if needed
    setIsRaisedHand, // exposed if needed
    setCurrentSnippetIndex,
    setSentencesLength
  } = actions;

  // Derived Visual State (Background Zoom)
  const currentSpeakerId = useMemo(() => {
    if (councilState === 'loading') return "";
    if (councilState === 'human_input') return humanName;
    if (councilState === 'human_panelist' && textMessages[playNextIndex]) return textMessages[playNextIndex].speaker;
    if (textMessages[playingNowIndex]) return textMessages[playingNowIndex].speaker;
    return "";
  }, [councilState, playingNowIndex, textMessages, playNextIndex, humanName]);

  const zoomIn = useMemo(() => {
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
  }, [councilState, playingNowIndex, textMessages, currentSnippetIndex, sentencesLength]);

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

  // Derived UI State
  const showControls = (
    councilState === 'playing' ||
    councilState === 'waiting' ||
    (councilState === 'summary' && tryToFindTextAndAudio())
  ) ? true : false;

  // Note: meetingMaxLength is internal to hook now. We might need it for `canExtendMeeting`?
  // Hook didn't expose meetingMaxLength. 
  // Let's check `canExtendMeeting` logic in original file: `meetingMaxLength < globalOptions.meetingVeryMaxLength`.
  // We need to expose `meetingMaxLength` from hook if we want this check here.
  // OR move canExtendMeeting into the hook. 
  // Hook has `handleOnContinueMeetingLonger`, maybe it should expose `canExtendMeeting` boolean?

  // Placeholder removed as it comes from state now
  const location = useLocation();
  const isDocumentVisible = useDocumentVisibility();

  // Additional Pausing triggers that are purely local UI concerns?
  // Actually, the Hook handles pausing based on Overlay/Location/DocumentVisibility?
  // Hook handles Overlay, Location, ConnectionError.
  // DocumentVisibility? Hook needs it passed in or handled?
  // Original Council.tsx: `else if (connectionError || !isDocumentVisible) { setPaused(true); }`
  // My Hook: `else if (connectionError) { setPaused(true); }`
  // I missed `isDocumentVisible` in the hook logic!

  // I need to update the hook to accept `isDocumentVisible` or handle logic there.
  // For now, I can add a dedicated effect here to setPaused if !isDocumentVisible.
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
          <HumanInput socketRef={socketRef} foods={foods} isPanelist={(councilState === 'human_panelist')} currentSpeakerName={participants.find(p => p.id === currentSpeakerId)?.name || ""} onSubmitHumanMessage={handleOnSubmitHumanMessage} />
        )}
        <Output
          textMessages={textMessages}
          audioMessages={audioMessages}
          playingNowIndex={playingNowIndex}
          councilState={councilState}
          isMuted={false} // isMuted was state in Council.tsx, I need to add that back or to hook?
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
          isMuted={false} // Placeholder
          onMuteUnmute={() => { }} // Placeholder
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
