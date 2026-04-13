import type { Character, Topic } from "@shared/ModelTypes";
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import Overlay from "./Overlay";
import CouncilOverlays from "./CouncilOverlays";
import Loading from "./Loading";
import Output from "./Output";
import ConversationControls from "./ConversationControls";
import HumanInput from "./HumanInput";
import { useDocumentVisibility } from "@/utils";
import { useCouncilMachine } from "@hooks/useCouncilMachine";
import { getMeeting } from "@api/getMeeting.js";
import type { Meeting } from "@shared/ModelTypes";

interface CouncilProps {
  creatorKey: string | null;
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

function Council({
  creatorKey,
  setUnrecoverableError,
  setConnectionError,
  connectionError,
  audioContext,
  setAudioPaused,
  currentSpeakerId,
  setCurrentSpeakerId,
  isPaused,
  setPaused,
}: CouncilProps) {

  const { meetingId } = useParams<{ meetingId: string }>();

  const navigate = useNavigate();

  const currentMeetingId = Number(meetingId);

  const [topic, setTopic] = useState<Topic | null>(null);
  const [participants, setParticipants] = useState<Character[]>([]);

  // Abort in-flight GET when deps change or on unmount (StrictMode-safe); same pattern as TanStack Query/SWR cancellation.
  useEffect(() => {
    if (!creatorKey || !meetingId || !/^\d+$/.test(meetingId)) {
      navigate("/");
      return;
    }

    const ac = new AbortController();
    void (async () => {
      try {
        const meeting: Meeting = await getMeeting({
          meetingId: currentMeetingId,
          creatorKey,
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        setTopic(meeting.topic);
        setParticipants(meeting.characters);
      } catch (error) {
        if (ac.signal.aborted) return;
        console.error(error);
        setUnrecoverableError(true);
      }
    })();

    return () => ac.abort();
  }, [creatorKey, meetingId, currentMeetingId, navigate, setUnrecoverableError]);

  // Hook Logic
  const { state, actions } = useCouncilMachine({
    currentMeetingId,
    creatorKey: creatorKey ?? undefined,
    topic,
    participants,
    audioContext,
    setUnrecoverableError,
    setConnectionError,
    connectionError,
    isPaused,
    setPaused,
    setAudioPaused,
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
          <HumanInput
            creatorKey={creatorKey!}
            isPanelist={councilState === "human_panelist"}
            currentSpeakerName={participants.find((p) => p.id === currentSpeakerId)?.name || ""}
            onSubmitHumanMessage={handleOnSubmitHumanMessage}
          />
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
            activeOverlay={activeOverlay}
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
