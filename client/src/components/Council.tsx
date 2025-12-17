import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router";
import io from "socket.io-client";
import Overlay from "./Overlay";
import CouncilOverlays from "./CouncilOverlays";
import Loading from "./Loading";
import Output from "./Output";
import ConversationControls from "./ConversationControls";
import HumanInput from "./HumanInput";
import { useDocumentVisibility, mapFoodIndex } from "@/utils";

// @ts-ignore
import globalOptions from "@/global-options-client.json";
import { useCouncilMachine } from "@/hooks/useCouncilMachine";
import { Character, ConversationMessage, Sentence } from "@shared/ModelTypes";
import { AudioUpdatePayload } from "@shared/SocketTypes";

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

export interface DecodedAudioMessage {
  id: string;
  audio: AudioBuffer;
  sentences?: Sentence[];
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

  // Use the shared hook for all logic
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
    socketRef,
    isMuted,
    canExtendMeeting,

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
    setSentencesLength,
    toggleMute,
    // Helper to check if data is ready (used for controls/overlays logic internal to hook, but we might need it for rendering?)
    tryToFindTextAndAudio
  } = useCouncilMachine({
    lang,
    topic,
    participants,
    audioContext, // Passed from Main
    setUnrecoverableError,
    setConnectionError,
    connectionError,
    isPaused,
    setPaused,
    setAudioPaused // Passed from Main
  });

  // Routing
  const navigate = useNavigate();
  const location = useLocation();
  const [currentMeetingIdState, setCurrentMeetingId] = useState<string | null>(null); // Do we need this? Hook has it.

  // Sync current speaker ID to parent component for Forest zoom
  // This is the "Adapter" logic to bridge the Hook (Logic) and Main (Forest Visuals)
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

  // Derived state for Controls visibility
  const showControls = (
    councilState === 'playing' ||
    councilState === 'waiting' ||
    (councilState === 'summary' && tryToFindTextAndAudio())
  ) ? true : false;

  // Forest Rendering
  return (
    <>
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
            meetingId={currentMeetingId}
            participants={participants}
          />
        )}
      </Overlay>
    </>
  );
}

export default Council;
