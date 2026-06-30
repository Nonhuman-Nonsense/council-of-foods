import type { Character, Meeting, Topic } from "@shared/ModelTypes";
import { isSpeakerMessage } from "@shared/ModelTypes";
import React, { useMemo, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import FoodsCouncilScene from "./FoodsCouncilScene";
import CouncilOverlays from "./overlays/CouncilOverlays";
import Loading from "@main/Loading";
import Output from "./output/Output";
import ConversationControls from "./ConversationControls";
import HumanInput from "./humanInput/HumanInput";
import { getParticipationPhase } from "./humanInput/participationPhase";
import { useTranslation } from "react-i18next";
import { useCouncilMachine } from "./hooks/useCouncilMachine";
import { getMeeting } from "@api/getMeeting.js";
import { useCouncilSettings } from "@/settings/councilSettings";
import { z } from "@/zIndexLayers";
import CouncilReplaySession from "./CouncilReplaySession";
import ButtonBanner from "@/museum/button/ButtonBanner";
import MeetingMetaAgent from "@museum/metaAgent/MeetingMetaAgent";
import type { MetaAgentPhase } from "@museum/metaAgent/useMetaAgent";
import { CHAIR_ID } from "@/prompts/characterSetupBundles";
import type { SetUnrecoverableError } from "@main/overlay/CouncilError";
import { notifyAutoplay } from "@/autoplay/autoplayStore";
import type { SummaryPlaybackState } from "@council/summaryScrollSync";

interface CouncilProps {
  liveKey: string | null;
  setliveKey: (key: string) => void;
  topic: Topic | null;
  setTopic: (topic: Topic) => void;
  setUnrecoverableError: SetUnrecoverableError;
  setConnectionError: (source: "socket" | "meta-agent", active: boolean) => void;
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
  const [summaryPlayback, setSummaryPlayback] = useState<SummaryPlaybackState>(null);

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
          error instanceof Error && error.message.trim().length > 0 ? error.message : t("error.message");
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

  useEffect(() => {
    if (visibleOverlay !== "summary") {
      setSummaryPlayback(null);
    }
  }, [visibleOverlay]);

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
      <CouncilReplaySession
        meeting={replayManifest}
        liveKey={liveKey}
        isPaused={isPaused}
        language={i18n.language}
      />
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
          setUnrecoverableError={setUnrecoverableError}
          setConnectionError={(active) => setConnectionError("meta-agent", active)}
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
      {/* council-shell: flex column owning the overlay content region + footer.
          Scene / Loading / MeetingMetaAgent / HumanInput stay as full-viewport
          siblings above this shell and are unaffected. */}
      <div className="council-shell" style={{ zIndex: z.routeOverlay }}>
        {/* Dedicated dim backdrop — covers the whole background when a council
            overlay is open. The blur class adds a backdrop-filter blur (same
            technique as Overlay.tsx). Sits below footer and content layers so
            controls and replay banner remain fully visible above it. */}
        {visibleOverlay !== null && (
          <div className="council-shell__backdrop blur" />
        )}

        {/* Main overlay-content region — fills all space above the footer. */}
        <div
          className="council-shell__main"
          style={visibleOverlay !== null ? { pointerEvents: "auto" } : undefined}
        >
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
              audioContext={audioContext}
              summaryPlayback={summaryPlayback}
            />
          )}
        </div>

        {/* Footer — Output, controls, and banner in the bottom flex column. */}
        <div className="council-shell__footer" style={{ pointerEvents: "auto" }}>
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
              onSummaryPlaybackChange={setSummaryPlayback}
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
          <ButtonBanner inline />
        </div>
      </div>
    </>
  );
}

export default Council;
