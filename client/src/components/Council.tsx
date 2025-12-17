import React, { useEffect, useMemo } from "react";
import { useLocation } from "react-router";
import Overlay from "./Overlay";
import CouncilOverlays from "./CouncilOverlays";
import Loading from "./Loading";
import Output from "./Output";
import ConversationControls from "./ConversationControls";
import HumanInput from "./HumanInput";
import { useDocumentVisibility } from "@/utils";
import routes from "@/routes.json";
import { Character } from "@shared/ModelTypes";
import { useCouncilMachine } from "@/hooks/useCouncilMachine";

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
    // sentencesLength,
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
    // setSentencesLength
  } = actions;

  // Routing
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
            meetingId={currentMeetingId || ""}
            participants={participants}
          />
        )}
      </Overlay>
    </>
  );
}

export default Council;
