import { useEffect, useMemo, useRef } from "react";
import { useButton, type ButtonLedMode } from "@museum/button/useButton";
import { BUTTON_IDLE_REMIND_MS, useHoldToSpeakHint } from "@voice/useHoldToSpeakHint";
import RealtimeCaptionOverlay from "@realtime/RealtimeCaptionOverlay";
import { useMetaAgent } from "./useMetaAgent";
import {
  buildMetaAgentPrompt,
  buildMetaAgentActivationTurn,
  buildMetaAgentStateSnapshot,
  getMetaAgentBundle,
} from "./metaAgentPrompt";
import {
  createMetaAgentTools,
  createMetaAgentToolHandlers,
} from "./metaAgentTools";
import { log } from "@/logger";
import type { ParticipationPhase } from "@council/humanInput/participationPhase";
import type { CouncilState } from "@council/hooks/useCouncilMachine";
import type { Character, Topic } from "@shared/ModelTypes";

export interface MeetingMetaAgentProps {
  liveKey: string;
  language: string;
  participationPhase: ParticipationPhase;
  metaAgentActive: boolean;
  setMetaAgentActive: (active: boolean) => void;
  setAgentSpeaking: (speaking: boolean) => void;
  onRestartMeeting: () => void;
  // Context for state snapshot
  councilState: CouncilState;
  topic: Topic | null;
  participants: Character[];
  currentSpeakerName: string;
  humanName: string;
}

/**
 * Museum meta-agent: a persistent WebRTC voice agent that sits on top of the
 * council meeting.  The visitor can press the PTT button at any time to talk
 * to the chair (meta-agent).  Council output unmounts while the meta agent is
 * active; meeting speech restarts from the beginning when the agent calls
 * `continue_meeting`.
 *
 * Mounting contract:
 *  - Only mount when `pushToTalkMode && liveKey` (live meeting + PTT).
 *  - Button presses route via shared claim arbitration (human-input wins in active phase).
 */
export default function MeetingMetaAgent({
  liveKey,
  language,
  participationPhase,
  metaAgentActive,
  setMetaAgentActive,
  setAgentSpeaking,
  onRestartMeeting,
  councilState,
  topic,
  participants,
  currentSpeakerName,
  humanName,
}: MeetingMetaAgentProps) {
  const button = useButton("meta-agent");

  const promptBundle = useMemo(() => getMetaAgentBundle(language), [language]);

  const instructions = useMemo(
    () =>
      buildMetaAgentPrompt({
        bundle: promptBundle,
        pushToTalkMode: true,
      }),
    [promptBundle],
  );

  const tools = useMemo(
    () => createMetaAgentTools({ promptBundle }),
    [promptBundle],
  );

  const silenceRef = useRef<() => void>(() => undefined);

  const toolHandlers = useMemo(
    () =>
      createMetaAgentToolHandlers({
        setMetaAgentActive,
        onRestartMeeting,
        silenceAgentOutput: () => silenceRef.current(),
      }),
    [setMetaAgentActive, onRestartMeeting],
  );

  const {
    connectionState,
    error,
    lastCaption,
    lastUserTranscript,
    agentSpeaking,
    micStream,
    setMicEnabled,
    sendUserMessage,
    requestAgentResponse,
    setAgentOutputMuted,
  } = useMetaAgent({
    language,
    liveKey,
    instructions,
    tools,
    toolHandlers,
  });

  useEffect(() => {
    button.claim();
    return () => button.release();
  }, [button.claim, button.release]);

  const ledMode: ButtonLedMode =
    connectionState !== "ready" ? "off" : metaAgentActive && button.pressed ? "on" : "pulse";

  useEffect(() => {
    button.setLed(ledMode);
  }, [button.setLed, ledMode]);

  const { showHoldToSpeakHint, idleRemindVisible } = useHoldToSpeakHint({
    pushToTalkMode: true,
    sessionActive: metaAgentActive,
    isConnecting: connectionState === "connecting",
    micOpen: metaAgentActive && button.pressed,
    lastUserTranscript,
    lastCaption,
  });

  useEffect(() => {
    setAgentSpeaking(agentSpeaking);
  }, [agentSpeaking, setAgentSpeaking]);

  useEffect(() => {
    if (!metaAgentActive) {
      setAgentSpeaking(false);
    }
  }, [metaAgentActive, setAgentSpeaking]);

  useEffect(() => {
    silenceRef.current = () => {
      setMicEnabled(false);
      setAgentOutputMuted(true);
    };
  }, [setMicEnabled, setAgentOutputMuted]);

  // Standby → Active: rising edge of routed press while not yet active.
  useEffect(() => {
    if (!button.pressed || metaAgentActive) return;

    setMetaAgentActive(true);
    setAgentOutputMuted(false);
    setMicEnabled(true);
    log.event("META", "activate", {
      councilState,
      participationPhase,
      currentSpeakerName,
    });
    sendUserMessage(
      buildMetaAgentStateSnapshot({
        councilState,
        topic,
        participants,
        currentSpeakerName,
        humanName,
        participationPhase,
      }),
    );
    sendUserMessage(buildMetaAgentActivationTurn());
    requestAgentResponse();
  }, [
    button.pressed,
    metaAgentActive,
    setMetaAgentActive,
    setAgentOutputMuted,
    setMicEnabled,
    sendUserMessage,
    requestAgentResponse,
    councilState,
    topic,
    participants,
    currentSpeakerName,
    humanName,
    participationPhase,
  ]);

  // Active: routed press controls mic-open within a turn.
  useEffect(() => {
    if (!metaAgentActive) return;
    setMicEnabled(button.pressed);
  }, [button.pressed, metaAgentActive, setMicEnabled]);

  // Ensure mic is closed whenever we leave active mode.
  useEffect(() => {
    if (!metaAgentActive) {
      setMicEnabled(false);
    }
  }, [metaAgentActive, setMicEnabled]);

  const idleResumeFiredRef = useRef(false);

  useEffect(() => {
    if (metaAgentActive) return;
    idleResumeFiredRef.current = false;
  }, [metaAgentActive]);

  useEffect(() => {
    if (!idleRemindVisible) {
      idleResumeFiredRef.current = false;
    }
  }, [idleRemindVisible]);

  // Auto-resume 10s after the idle PTT reminder appears (not while agent or visitor is active).
  useEffect(() => {
    if (!metaAgentActive || connectionState !== "ready") return;
    if (!idleRemindVisible) return;
    if (idleResumeFiredRef.current) return;
    if (agentSpeaking || button.pressed) return;

    const timerId = window.setTimeout(() => {
      if (idleResumeFiredRef.current) return;
      if (agentSpeaking || button.pressed) return;
      idleResumeFiredRef.current = true;
      log.event("META", "idle auto-resume continue_meeting");
      toolHandlers.continue_meeting({});
    }, BUTTON_IDLE_REMIND_MS);

    return () => window.clearTimeout(timerId);
  }, [
    metaAgentActive,
    connectionState,
    idleRemindVisible,
    agentSpeaking,
    button.pressed,
    toolHandlers,
  ]);

  if (!metaAgentActive) return null;

  return (
    <RealtimeCaptionOverlay
      error={error}
      lastCaption={lastCaption}
      lastUserTranscript={lastUserTranscript}
      pushToTalkMode
      showHoldToSpeakHint={showHoldToSpeakHint}
      holdToSpeakKey="metaAgent.holdToSpeak"
      subtitleLayout="council"
      showPttVisualizer
      micStream={micStream}
      micActive={button.pressed}
    />
  );
}
