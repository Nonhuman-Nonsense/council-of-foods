import { useEffect, useMemo, useRef } from "react";
import { useButtonLed, useButtonPressed, useButtonPressOwner } from "@museum/button/hooks";
import { useHoldToSpeakHint } from "@voice/useHoldToSpeakHint";
import RealtimeCaptionOverlay from "@realtime/RealtimeCaptionOverlay";
import { useMetaAgent } from "./useMetaAgent";
import { buildMetaAgentPrompt, buildMetaAgentStateSnapshot } from "./metaAgentPrompt";
import {
  createMetaAgentTools,
  createMetaAgentToolHandlers,
} from "./metaAgentTools";
import type { ParticipationPhase } from "@council/humanInput/participationPhase";
import type { CouncilState } from "@council/hooks/useCouncilMachine";
import type { Character, Topic } from "@shared/ModelTypes";

export interface MeetingMetaAgentProps {
  liveKey: string;
  language: string;
  participationPhase: ParticipationPhase;
  setAudioPaused: (paused: boolean) => void;
  metaAgentActive: boolean;
  setMetaAgentActive: (active: boolean) => void;
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
 * to the chair (meta-agent).  Meeting Web Audio freezes while the meta agent is
 * active and only resumes when the agent calls `resume_meeting`.
 *
 * Mounting contract:
 *  - Only mount when `pushToTalkMode && liveKey` (live meeting + PTT).
 *  - Button presses route via shared intent arbitration (human-input wins in active phase).
 */
export default function MeetingMetaAgent({
  liveKey,
  language,
  participationPhase,
  setAudioPaused,
  metaAgentActive,
  setMetaAgentActive,
  onRestartMeeting,
  councilState,
  topic,
  participants,
  currentSpeakerName,
  humanName,
}: MeetingMetaAgentProps) {
  const instructions = useMemo(
    () => buildMetaAgentPrompt({ pushToTalkMode: true }),
    [],
  );

  const tools = useMemo(() => createMetaAgentTools(), []);

  const silenceRef = useRef<() => void>(() => undefined);

  const toolHandlers = useMemo(
    () =>
      createMetaAgentToolHandlers({
        setAudioPaused,
        setMetaAgentActive,
        onRestartMeeting,
        silenceAgentOutput: () => silenceRef.current(),
      }),
    [setAudioPaused, setMetaAgentActive, onRestartMeeting],
  );

  const {
    connectionState,
    error,
    lastCaption,
    lastUserTranscript,
    setMicEnabled,
    sendUserMessage,
    setAgentOutputMuted,
  } = useMetaAgent({
    language,
    liveKey,
    instructions,
    tools,
    toolHandlers,
  });

  const pressed = useButtonPressed("meta-agent");
  const pressOwner = useButtonPressOwner();

  const showHoldToSpeakHint = useHoldToSpeakHint({
    pushToTalkMode: true,
    sessionActive: metaAgentActive,
    isConnecting: connectionState === "connecting",
    micOpen: metaAgentActive && pressed,
    lastUserTranscript,
    lastCaption,
  });

  useEffect(() => {
    silenceRef.current = () => {
      setMicEnabled(false);
      setAgentOutputMuted(true);
    };
  }, [setMicEnabled, setAgentOutputMuted]);

  // Track whether we were active so we detect rising / falling edge.
  const wasActiveRef = useRef(metaAgentActive);
  useEffect(() => {
    wasActiveRef.current = metaAgentActive;
  });

  // Standby → Active: rising edge of routed press while not yet active.
  useEffect(() => {
    if (!pressed || metaAgentActive) return;

    setAudioPaused(true);
    setMetaAgentActive(true);
    setAgentOutputMuted(false);
    setMicEnabled(true);
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
  }, [
    pressed,
    metaAgentActive,
    setAudioPaused,
    setMetaAgentActive,
    setAgentOutputMuted,
    setMicEnabled,
    sendUserMessage,
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
    setMicEnabled(pressed);
  }, [pressed, metaAgentActive, setMicEnabled]);

  // Yield when human-input (or higher priority) takes the button.
  useEffect(() => {
    if (metaAgentActive && pressOwner !== "meta-agent") {
      setMetaAgentActive(false);
      setMicEnabled(false);
    }
  }, [pressOwner, metaAgentActive, setMetaAgentActive, setMicEnabled]);

  // Ensure mic is closed whenever we leave active mode.
  useEffect(() => {
    if (!metaAgentActive) {
      setMicEnabled(false);
    }
  }, [metaAgentActive, setMicEnabled]);

  const ledMode = metaAgentActive && pressed ? "on" : "pulse";
  useButtonLed("meta-agent", ledMode);

  if (!metaAgentActive) return null;

  return (
    <RealtimeCaptionOverlay
      error={error}
      lastCaption={lastCaption}
      lastUserTranscript={lastUserTranscript}
      pushToTalkMode
      showHoldToSpeakHint={showHoldToSpeakHint}
      holdToSpeakKey="metaAgent.holdToSpeak"
    />
  );
}
