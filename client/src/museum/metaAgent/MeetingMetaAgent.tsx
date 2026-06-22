import { useEffect, useMemo, useRef } from "react";
import { useButtonLed, useButtonPressed } from "@museum/button/hooks";
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
  isPaused: boolean;
  setPaused: (paused: boolean) => void;
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
 * to the chair (meta-agent).  The meeting pauses while the visitor speaks and
 * only resumes when the agent calls `resume_meeting`.
 *
 * Mounting contract:
 *  - Only mount when `isButtonMuseumMode && liveKey` (live meeting + PTT).
 *  - Only active when `participationPhase === "off"` (HumanInput has priority).
 */
export default function MeetingMetaAgent({
  liveKey,
  language,
  participationPhase,
  isPaused: _isPaused,
  setPaused,
  metaAgentActive,
  setMetaAgentActive,
  onRestartMeeting,
  councilState,
  topic,
  participants,
  currentSpeakerName,
  humanName,
}: MeetingMetaAgentProps) {
  // The meta agent is only "on" when HumanInput is not using the button.
  const buttonOwnerActive = participationPhase === "off";

  const instructions = useMemo(
    () => buildMetaAgentPrompt({ pushToTalkMode: true }),
    [],
  );

  const toolHandlers = useMemo(
    () =>
      createMetaAgentToolHandlers({
        setPaused,
        setMetaAgentActive,
        onRestartMeeting,
      }),
    [setPaused, setMetaAgentActive, onRestartMeeting],
  );

  const tools = useMemo(() => createMetaAgentTools(), []);

  const { setMicEnabled, sendUserMessage } = useMetaAgent({
    language,
    liveKey,
    instructions,
    tools,
    toolHandlers,
  });

  // Gated pressed: only triggers when buttonOwnerActive and pttInputEnabled.
  const pressed = useButtonPressed(buttonOwnerActive);

  // Track whether we were active so we detect rising / falling edge.
  const wasActiveRef = useRef(metaAgentActive);
  useEffect(() => {
    wasActiveRef.current = metaAgentActive;
  });

  // Standby → Active: rising edge of pressed while not yet active.
  useEffect(() => {
    if (!buttonOwnerActive) return;
    if (!pressed || metaAgentActive) return;

    // Pause the meeting.
    setPaused(true);
    // Mark meta agent as active (triggers chair zoom in Council).
    setMetaAgentActive(true);
    // Open the mic so the visitor's voice goes to the agent.
    setMicEnabled(true);
    // Inject a one-shot state snapshot so the agent has meeting context.
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
    buttonOwnerActive,
    setPaused,
    setMetaAgentActive,
    setMicEnabled,
    sendUserMessage,
    councilState,
    topic,
    participants,
    currentSpeakerName,
    humanName,
    participationPhase,
  ]);

  // Active: rising/falling edge of pressed controls mic-open within a turn.
  useEffect(() => {
    if (!buttonOwnerActive || !metaAgentActive) return;
    // Mic follows the button state inside active mode (multi-turn support).
    setMicEnabled(pressed);
  }, [pressed, metaAgentActive, buttonOwnerActive, setMicEnabled]);

  // Ensure mic is closed whenever we leave active mode (tool called or phase changed).
  useEffect(() => {
    if (!metaAgentActive) {
      setMicEnabled(false);
    }
  }, [metaAgentActive, setMicEnabled]);

  // LED: pulse in standby when button owner (invites visitor to press);
  //       on while recording (active + pressed).
  const ledMode = metaAgentActive && pressed ? "on" : "pulse";
  useButtonLed("meta-agent", ledMode, buttonOwnerActive);

  // Nothing to render — audio playback is via a hidden <audio> element created
  // inside useMetaAgent, and the visual feedback is the LED + meeting zoom.
  return null;
}
