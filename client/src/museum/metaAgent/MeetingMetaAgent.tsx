import { useEffect, useMemo, useRef } from "react";
import { useButton, type ButtonLedMode } from "@museum/button/useButton";
import { BUTTON_IDLE_REMIND_MS, useHoldToSpeakHint } from "@voice/useHoldToSpeakHint";
import RealtimeCaptionOverlay from "@realtime/RealtimeCaptionOverlay";
import { useMetaAgent, type MetaAgentPhase } from "./useMetaAgent";
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

export type { MetaAgentPhase } from "./useMetaAgent";

export interface MeetingMetaAgentProps {
  liveKey: string;
  language: string;
  participationPhase: ParticipationPhase;
  metaAgentPhase: MetaAgentPhase;
  setMetaAgentPhase: (phase: MetaAgentPhase) => void;
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
 * `resume_meeting`.
 *
 * Mounting contract:
 *  - Only mount when `isMuseumMode && liveKey` (live museum meeting).
 *  - Button presses route via shared claim arbitration (human-input wins in active phase).
 */
export default function MeetingMetaAgent({
  liveKey,
  language,
  participationPhase,
  metaAgentPhase,
  setMetaAgentPhase,
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
        setMetaAgentPhase,
        onRestartMeeting,
        silenceAgentOutput: () => silenceRef.current(),
      }),
    [setMetaAgentPhase, onRestartMeeting],
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
    onSessionReady: undefined,
  });

  useEffect(() => {
    button.claim();
    return () => button.release();
  }, [button.claim, button.release]);

  const ledMode: ButtonLedMode =
    connectionState !== "ready" ? "off" : metaAgentPhase !== "inactive" && button.pressed ? "on" : "pulse";

  useEffect(() => {
    button.setLed(ledMode);
  }, [button.setLed, ledMode]);

  const { showHoldToSpeakHint, idleRemindVisible } = useHoldToSpeakHint({
    pushToTalkMode: true,
    sessionActive: metaAgentPhase !== "inactive",
    isConnecting: connectionState === "connecting",
    micOpen: metaAgentPhase !== "inactive" && button.pressed,
    lastUserTranscript,
    lastCaption,
  });

  useEffect(() => {
    setAgentSpeaking(agentSpeaking);
  }, [agentSpeaking, setAgentSpeaking]);

  useEffect(() => {
    if (metaAgentPhase === "inactive") {
      setAgentSpeaking(false);
    }
  }, [metaAgentPhase, setAgentSpeaking]);

  useEffect(() => {
    silenceRef.current = () => {
      setMicEnabled(false);
      setAgentOutputMuted(true);
    };
  }, [setMicEnabled, setAgentOutputMuted]);

  // Standby → interruption: rising edge of routed press while inactive.
  useEffect(() => {
    if (!button.pressed || metaAgentPhase !== "inactive") return;

    setMetaAgentPhase("interruption");
    setAgentOutputMuted(false);
    setMicEnabled(true);
    log.event("META", "activate", {
      metaAgentPhase: "interruption",
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
    metaAgentPhase,
    setMetaAgentPhase,
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
    if (metaAgentPhase === "inactive") return;
    setMicEnabled(button.pressed);
  }, [button.pressed, metaAgentPhase, setMicEnabled]);

  // Ensure mic is closed whenever we leave active mode.
  useEffect(() => {
    if (metaAgentPhase === "inactive") {
      setMicEnabled(false);
    }
  }, [metaAgentPhase, setMicEnabled]);

  const idleResumeFiredRef = useRef(false);

  useEffect(() => {
    if (metaAgentPhase !== "inactive") return;
    idleResumeFiredRef.current = false;
  }, [metaAgentPhase]);

  useEffect(() => {
    if (!idleRemindVisible) {
      idleResumeFiredRef.current = false;
    }
  }, [idleRemindVisible]);

  // Auto-resume 10s after the idle PTT reminder appears (not while agent or visitor is active).
  useEffect(() => {
    if (metaAgentPhase !== "interruption") return;
    if (connectionState !== "ready") return;
    if (!idleRemindVisible) return;
    if (idleResumeFiredRef.current) return;
    if (agentSpeaking || button.pressed) return;

    const timerId = window.setTimeout(() => {
      if (idleResumeFiredRef.current) return;
      if (agentSpeaking || button.pressed) return;
      idleResumeFiredRef.current = true;
      log.event("META", "idle auto-resume resume_meeting");
      toolHandlers.resume_meeting({});
    }, BUTTON_IDLE_REMIND_MS);

    return () => window.clearTimeout(timerId);
  }, [
    metaAgentPhase,
    connectionState,
    idleRemindVisible,
    agentSpeaking,
    button.pressed,
    toolHandlers,
  ]);

  if (metaAgentPhase === "inactive") return null;

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
