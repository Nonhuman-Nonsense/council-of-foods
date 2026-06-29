import type { Character, Meeting, Topic } from "@shared/ModelTypes";
import { isSpeakerMessage } from "@shared/ModelTypes";
import React, { useMemo, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import FoodsCouncilScene from "./FoodsCouncilScene";
import Overlay from "@main/overlay/Overlay";
import CouncilOverlays from "./overlays/CouncilOverlays";
import Loading from "@main/Loading";
import Output from "./output/Output";
import ConversationControls from "./ConversationControls";
import HumanInput from "./humanInput/HumanInput";
import { getParticipationPhase } from "./humanInput/participationPhase";
import { useTranslation } from "react-i18next";
import { useCouncilMachine } from "./hooks/useCouncilMachine";
import { getMeeting } from "@api/getMeeting.js";
import ReplayModeBanner from "./ReplayModeBanner";
import { useCouncilSettings } from "@/settings/councilSettings";
import MeetingMetaAgent from "@museum/metaAgent/MeetingMetaAgent";
import type { MetaAgentPhase } from "@museum/metaAgent/useMetaAgent";
import { CHAIR_ID } from "@/prompts/characterSetupBundles";
import type { SetUnrecoverableError } from "@main/overlay/CouncilError";
import { notifyAutoplay } from "@/autoplay/autoplayStore";

interface CouncilProps {
  liveKey: string | null;
  setliveKey: (key: string) => void;
  topic: Topic | null;
  setTopic: (topic: Topic) => void;
  setUnrecoverableError: SetUnrecoverableError;
  setConnectionError: (error: boolean) => void;
  connectionError: boolean;
  audioContext: React.RefObject<AudioContext | null>;
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
  currentSpeakerId,
  setCurrentSpeakerId,
  isPaused,
  setPaused,
}: CouncilProps) {

  const { meetingId } = useParams<{ meetingId: string }>();
  const { t, i18n } = useTranslation();
  const { isMuseumMode, agentMode } = useCouncilSettings();

  const navigate = useNavigate();

  const currentMeetingId = Number(meetingId);

  const [participants, setParticipants] = useState<Character[]>([]);
  const [replayManifest, setReplayManifest] = useState<Meeting | null>(null);
  const [humanName, setHumanName] = useState("");
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  // Meta-agent lifecycle (inactive | interruption | extension). Stays in Council so it
  // resets on unmount; FoodsCouncilScene and MeetingMetaAgent are the only consumers.
  const [metaAgentPhase, setMetaAgentPhase] = useState<MetaAgentPhase>("inactive");

  // Abort in-flight GET when deps change or on unmount (StrictMode-safe); same pattern as TanStack Query/SWR cancellation.
  useEffect(() => {
    if (!meetingId || !/^\d+$/.test(meetingId)) {
      navigate("/");
      return;
    }

    setHumanName("");
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
        const storedName = meeting.state?.humanName?.trim();
        if (storedName && storedName.length > 0) {
          setHumanName(storedName);
        }
      } catch (error) {
        if (ac.signal.aborted) return;
        console.error(error);
        const msg =
          error instanceof Error && error.message.trim().length > 0 ? error.message : t("error.1");
        setUnrecoverableError({
          message: msg,
          source: "Council.loadMeeting",
          cause: error,
          meetingId: currentMeetingId,
        });
      }
    })();
    return () => ac.abort();
  }, [liveKey, meetingId, currentMeetingId, setUnrecoverableError]);

  // Hook Logic
  const { state, actions } = useCouncilMachine({
    currentMeetingId,
    liveKey: liveKey ?? undefined,
    setliveKey,
    replayManifest: liveKey ? null : replayManifest,
    topic,
    participants,
    humanName,
    setHumanName,
    audioContext,
    setUnrecoverableError,
    setConnectionError,
    connectionError,
    isPaused,
    setPaused,
    isMuseumMode,
    agentMode,
    setMetaAgentPhase,
    metaAgentPhase,
  });

  const {
    councilState,
    textMessages,
    audioMessages,
    playingNowIndex,
    playNextIndex,
    visibleOverlay,
    summary,
    isRaisedHand,
    canGoBack,
    canGoForward,
    canRaiseHand,
    currentSnippetIndex,
    isMuted,
  } = state;

  const {
    tryToFindTextAndAudio,
    handleOnFinishedPlaying,
    handleOnSkipBackward,
    handleOnSkipForward,
    handleOnSubmitHumanMessage,
    handleOnAbandonHumanTurn,
    handleOnExtendMeeting,
    handleOnAttemptResume,
    handleOnConcludeMeeting,
    handleHumanNameEntered,
    handleOnRaiseHand,
    declineOverlay,
    setCurrentSnippetIndex,
    toggleMute
  } = actions;

  // Derive who is performing from playback, then publish `currentSpeakerId` to Main.
  // Forest's always-mounted scene (sibling of Council) uses it for being animation/audio
  // and camera zoom. During meta-agent, chair speaks as `CHAIR_ID` or `""` when idle.
  // Meta-agent session/zoom framing uses `metaAgentPhase` locally — not lifted to Main.
  const derivedCurrentSpeakerId = useMemo(() => {
    if (metaAgentPhase !== "inactive") {
      return agentSpeaking ? CHAIR_ID : "";
    }
    if (councilState === 'loading') return "";
    if (councilState === 'human_input') return humanName;
    if (councilState === 'human_panelist') {
      const pendingMessage = textMessages[playNextIndex];
      return pendingMessage?.type === 'awaiting_human_panelist' ? pendingMessage.speaker : "";
    }
    const activeMessage = textMessages[playingNowIndex];
    if (activeMessage && isSpeakerMessage(activeMessage)) return activeMessage.speaker;
    return "";
  }, [metaAgentPhase, agentSpeaking, councilState, playingNowIndex, textMessages, playNextIndex, humanName]);

  useEffect(() => {
    if (councilState !== 'human_panelist') return;

    const pendingMessage = textMessages[playNextIndex];
    if (pendingMessage?.type !== 'awaiting_human_panelist') {
      const detail = "Internal state mismatch: human_panelist state requires an awaiting_human_panelist message.";
      setUnrecoverableError({
        message: detail,
        source: "Council.human_panelist_state",
        meetingId: currentMeetingId,
      });
    }
  }, [councilState, textMessages, playNextIndex, setUnrecoverableError]);

  useEffect(() => {
    setCurrentSpeakerId(derivedCurrentSpeakerId);
  }, [derivedCurrentSpeakerId, setCurrentSpeakerId]);

  useEffect(() => {
    notifyAutoplay({ type: "council-state", state: councilState });
  }, [councilState]);

  // Derived UI State
  const participationPhase = getParticipationPhase(councilState, textMessages, playingNowIndex);
  const isButtonMuseumMode = useMemo(
    () => isMuseumMode && agentMode === "ptt",
    [isMuseumMode, agentMode]
  );
  const isWaitingToInterject = isRaisedHand && councilState !== 'human_input';
  const controlsVisible = (
    councilState === 'playing' ||
    councilState === 'waiting' ||
    (councilState === 'summary' && tryToFindTextAndAudio())
  );

  // Placeholder removed as it comes from state now
  const location = useLocation();

  return (
    <>
      <FoodsCouncilScene
        participants={participants}
        currentSpeakerId={currentSpeakerId}
        councilState={councilState}
        playingNowIndex={playingNowIndex}
        textMessages={textMessages}
        audioMessages={audioMessages}
        currentSnippetIndex={currentSnippetIndex}
        isPaused={isPaused}
        metaAgentPhase={metaAgentPhase}
        agentSpeaking={agentSpeaking}
      />
      {councilState === 'loading' && <Loading />}
      {isMuseumMode && liveKey && agentMode === "ptt" && (
        <MeetingMetaAgent
          liveKey={liveKey}
          language={i18n.language}
          participationPhase={participationPhase}
          metaAgentPhase={metaAgentPhase}
          setMetaAgentPhase={setMetaAgentPhase}
          setAgentSpeaking={setAgentSpeaking}
          onRestartMeeting={() => navigate("/")}
          onExtendMeeting={handleOnExtendMeeting}
          onConcludeMeeting={handleOnConcludeMeeting}
          councilState={councilState}
          topic={topic}
          participants={participants}
          currentSpeakerName={participants.find((p) => p.id === currentSpeakerId)?.name ?? ""}
          humanName={humanName}
        />
      )}
      {liveKey && participationPhase !== "off" && (
        <HumanInput
          phase={participationPhase}
          liveKey={liveKey}
          isPanelist={councilState === 'human_panelist'}
          currentSpeakerName={participants.find(p => p.id === currentSpeakerId)?.name || ""}
          onSubmitHumanMessage={handleOnSubmitHumanMessage}
          onAbandonHumanTurn={handleOnAbandonHumanTurn}
          isButtonMuseumMode={isButtonMuseumMode}
        />
      )}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", overflow: "visible" }}>
        {metaAgentPhase === "inactive" && (
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
        )}
        {controlsVisible && metaAgentPhase === "inactive" && (
          <ConversationControls
            hidden={isMuseumMode}
            onSkipBackward={handleOnSkipBackward}
            onSkipForward={handleOnSkipForward}
            onRaiseHand={handleOnRaiseHand}
            isRaisedHand={isRaisedHand}
            isWaitingToInterject={isWaitingToInterject}
            isMuted={isMuted}
            onMuteUnmute={toggleMute}
            isPaused={isPaused}
            onPausePlay={() => setPaused(!isPaused)}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            canRaiseHand={canRaiseHand}
            onTopOfOverlay={visibleOverlay === "summary" && location.hash === ""}
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
      <Overlay isActive={visibleOverlay !== null}>
        {visibleOverlay !== null && (
          <CouncilOverlays
            overlay={visibleOverlay}
            onExtendMeeting={handleOnExtendMeeting}
            onAttemptResume={handleOnAttemptResume}
            onConcludeMeeting={handleOnConcludeMeeting}
            proceedWithHumanName={handleHumanNameEntered}
            onDismiss={declineOverlay}
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
