import type { Character, Meeting, Topic } from "@shared/ModelTypes";
import { isSpeakerMessage } from "@shared/ModelTypes";
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import Overlay from "@main/overlay/Overlay";
import CouncilOverlays from "./overlays/CouncilOverlays";
import Loading from "@main/Loading";
import Output from "./output/Output";
import ConversationControls from "./ConversationControls";
import HumanInput from "./humanInput/HumanInput";
import { useDocumentVisibility } from "@/utils";
import { useTranslation } from "react-i18next";
import { useCouncilMachine } from "./hooks/useCouncilMachine";
import { getMeeting } from "@api/getMeeting.js";
import ReplayModeBanner from "./ReplayModeBanner";

interface CouncilProps {
  liveKey: string | null;
  setliveKey: (key: string) => void;
  topic: Topic | null;
  setTopic: (topic: Topic) => void;
  setUnrecoverableError: (message: string) => void;
  setConnectionError: (error: boolean) => void;
  connectionError: boolean;
  audioContext: React.RefObject<AudioContext | null>;
  setAudioPaused: (paused: boolean) => void;
  currentSpeakerId: string;
  setCurrentSpeakerId: (id: string) => void;
  isPaused: boolean;
  setPaused: (paused: boolean) => void;
}

function Council({
  liveKey,
  setliveKey,
  topic,
  setTopic,
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
  const { t } = useTranslation();

  const navigate = useNavigate();
  const location = useLocation();

  const currentMeetingId = Number(meetingId);

  const [participants, setParticipants] = useState<Character[]>([]);
  const [replayManifest, setReplayManifest] = useState<Meeting | null>(null);

  // Abort in-flight GET when deps change or on unmount (StrictMode-safe); same pattern as TanStack Query/SWR cancellation.
  useEffect(() => {
    if (!meetingId || !/^\d+$/.test(meetingId)) {
      navigate("/");
      return;
    }

    const ac = new AbortController();
    void (async () => {
      try {
        const meeting = await getMeeting({
          meetingId: currentMeetingId,
          liveKey,
          signal: ac.signal,
        });
        if (ac.signal.aborted) return;
        if (!liveKey) {
          setReplayManifest(meeting);
        }
        setTopic(meeting.topic);
        setParticipants(meeting.characters);
      } catch (error) {
        if (ac.signal.aborted) return;
        console.error(error);
        const msg =
          error instanceof Error && error.message.trim().length > 0 ? error.message : t("error.1");
        setUnrecoverableError(msg);
      }
    })();
    return () => ac.abort();
  }, [liveKey, meetingId, currentMeetingId, navigate, setUnrecoverableError]);

  const { state, actions } = useCouncilMachine({
    currentMeetingId,
    liveKey: liveKey ?? undefined,
    setliveKey,
    replayManifest: liveKey ? null : replayManifest,
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
    handleOnAttemptResume,
    handleOnGenerateSummary,
    handleHumanNameEntered,
    handleOnRaiseHand,
    cancelOverlay,
    setCurrentSnippetIndex,
    toggleMute,
  } = actions;

  useEffect(() => {
    if (councilState !== "human_panelist") return;

    const pendingMessage = textMessages[playNextIndex];
    if (pendingMessage?.type !== "awaiting_human_panelist") {
      setUnrecoverableError(
        "Internal state mismatch: human_panelist state requires an awaiting_human_panelist message."
      );
    }
  }, [councilState, textMessages, playNextIndex, setUnrecoverableError]);

  // Sync current speaker ID to parent component for Forest zoom.
  useEffect(() => {
    if (councilState === "loading") {
      setCurrentSpeakerId("");
      return;
    }

    if (councilState === "human_input") {
      setCurrentSpeakerId("");
      return;
    }

    if (councilState === "human_panelist") {
      const pendingMessage = textMessages[playNextIndex];
      if (pendingMessage?.type === "awaiting_human_panelist") {
        setCurrentSpeakerId(pendingMessage.speaker.toLowerCase());
      } else {
        setCurrentSpeakerId("");
      }
      return;
    }

    if (councilState === "summary") {
      setCurrentSpeakerId("");
      return;
    }

    if (playingNowIndex >= 0) {
      const activeMessage = textMessages[playingNowIndex];
      if (activeMessage && isSpeakerMessage(activeMessage)) {
        setCurrentSpeakerId(activeMessage.speaker.toLowerCase());
      }
    }
  }, [playingNowIndex, textMessages, setCurrentSpeakerId, councilState, playNextIndex]);

  const showControls =
    councilState === "playing" ||
    councilState === "waiting" ||
    (councilState === "summary" && tryToFindTextAndAudio());

  const isDocumentVisible = useDocumentVisibility();

  useEffect(() => {
    if (!isDocumentVisible && !isPaused) {
      setPaused(true);
    }
  }, [isDocumentVisible, isPaused]);

  return (
    <>
      {councilState === 'loading' && <Loading />}
      {liveKey && (councilState === 'human_input' || councilState === 'human_panelist') && (
        <HumanInput liveKey={liveKey} isPanelist={(councilState === 'human_panelist')} currentSpeakerName={participants.find(p => p.id === currentSpeakerId)?.name || ""} onSubmitHumanMessage={handleOnSubmitHumanMessage} />
      )}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", overflow: "visible" }}>
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
        {showControls && (
          <ConversationControls
            onSkipBackward={handleOnSkipBackward}
            onSkipForward={handleOnSkipForward}
            onRaiseHand={handleOnRaiseHand}
            isRaisedHand={isRaisedHand}
            isWaitingToInterject={isRaisedHand}
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
        {replayManifest && (
          <ReplayModeBanner
            meeting={replayManifest}
            isPaused={isPaused}
            visible={!liveKey}
          />
        )}
      </div>
      <Overlay isActive={activeOverlay !== null}>
        {activeOverlay !== null && (
          <CouncilOverlays
            activeOverlay={activeOverlay}
            onContinue={handleOnContinueMeetingLonger}
            onAttemptResume={handleOnAttemptResume}
            onWrapItUp={handleOnGenerateSummary}
            proceedWithHumanName={handleHumanNameEntered}
            canExtendMeeting={canExtendMeeting}
            cancelOverlay={cancelOverlay}
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
