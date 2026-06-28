import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useButton, type ButtonLedMode } from "@museum/button/useButton";
import { BUTTON_IDLE_REMIND_MS, useHoldToSpeakHint } from "@voice/useHoldToSpeakHint";
import RealtimeCaptionOverlay from "@realtime/RealtimeCaptionOverlay";
import Loading from "@main/Loading";
import { useMetaAgent, type MetaAgentPhase } from "./useMetaAgent";
import {
  buildExtensionActivationTurn,
  buildExtensionAgentPrompt,
  buildExtensionStateSnapshot,
  buildMetaAgentPrompt,
  buildMetaAgentActivationTurn,
  buildMetaAgentStateSnapshot,
  getMetaAgentBundle,
} from "./metaAgentPrompt";
import {
  createExtensionAgentToolHandlers,
  createExtensionAgentTools,
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
  onExtendMeeting: () => void;
  onConcludeMeeting: () => void;
  councilState: CouncilState;
  topic: Topic | null;
  participants: Character[];
  currentSpeakerName: string;
  humanName: string;
}

export default function MeetingMetaAgent({
  liveKey,
  language,
  participationPhase,
  metaAgentPhase,
  setMetaAgentPhase,
  setAgentSpeaking,
  onRestartMeeting,
  onExtendMeeting,
  onConcludeMeeting,
  councilState,
  topic,
  participants,
  currentSpeakerName,
  humanName,
}: MeetingMetaAgentProps) {
  const button = useButton("meta-agent");

  const promptBundle = useMemo(() => getMetaAgentBundle(language), [language]);

  const instructions = useMemo(() => {
    if (metaAgentPhase === "extension") {
      return buildExtensionAgentPrompt({ bundle: promptBundle, pushToTalkMode: true });
    }
    return buildMetaAgentPrompt({ bundle: promptBundle, pushToTalkMode: true });
  }, [metaAgentPhase, promptBundle]);

  const tools = useMemo(() => {
    if (metaAgentPhase === "extension") {
      return createExtensionAgentTools({ promptBundle });
    }
    return createMetaAgentTools({ promptBundle });
  }, [metaAgentPhase, promptBundle]);

  const silenceRef = useRef<() => void>(() => undefined);
  const reconfigureRef = useRef<() => void>(() => undefined);
  const pendingSessionActivationRef = useRef<MetaAgentPhase | null>(null);
  const [awaitingExtensionReply, setAwaitingExtensionReply] = useState(false);
  const prevPhaseRef = useRef<MetaAgentPhase>("inactive");

  const snapshotContext = useMemo(
    () => ({
      councilState,
      topic,
      participants,
      currentSpeakerName,
      humanName,
      participationPhase,
    }),
    [councilState, topic, participants, currentSpeakerName, humanName, participationPhase],
  );

  const toolHandlers = useMemo(() => {
    const shared = {
      setMetaAgentPhase,
      silenceAgentOutput: () => silenceRef.current(),
      reconfigureSession: () => reconfigureRef.current(),
    };
    if (metaAgentPhase === "extension") {
      return createExtensionAgentToolHandlers({
        ...shared,
        onExtendMeeting,
        onConcludeMeeting,
      });
    }
    return createMetaAgentToolHandlers({
      ...shared,
      onRestartMeeting,
    });
  }, [metaAgentPhase, setMetaAgentPhase, onRestartMeeting, onExtendMeeting, onConcludeMeeting]);

  const onSessionReadyRef = useRef<(() => void) | undefined>(undefined);

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
    reconfigureSession,
  } = useMetaAgent({
    language,
    liveKey,
    instructions,
    tools,
    toolHandlers,
    onSessionReady: () => onSessionReadyRef.current?.(),
  });

  const activateExtensionSession = useCallback(() => {
    setAgentOutputMuted(false);
    setMicEnabled(false);
    log.event("META", "activate", {
      metaAgentPhase: "extension",
      councilState,
      participationPhase,
      currentSpeakerName,
    });
    sendUserMessage(buildExtensionStateSnapshot(snapshotContext));
    sendUserMessage(buildExtensionActivationTurn());
    requestAgentResponse();
  }, [
    setAgentOutputMuted,
    setMicEnabled,
    sendUserMessage,
    requestAgentResponse,
    councilState,
    participationPhase,
    currentSpeakerName,
    snapshotContext,
  ]);

  useEffect(() => {
    onSessionReadyRef.current = () => {
      if (pendingSessionActivationRef.current === "extension") {
        pendingSessionActivationRef.current = null;
        activateExtensionSession();
      }
    };
  }, [activateExtensionSession]);

  useEffect(() => {
    silenceRef.current = () => {
      setMicEnabled(false);
      setAgentOutputMuted(true);
    };
    reconfigureRef.current = () => reconfigureSession();
  }, [setMicEnabled, setAgentOutputMuted, reconfigureSession]);

  useEffect(() => {
    button.claim();
    return () => button.release();
  }, [button.claim, button.release]);

  const ledMode: ButtonLedMode =
    connectionState !== "ready" ? "off" : metaAgentPhase !== "inactive" && button.pressed ? "on" : "pulse";

  useEffect(() => {
    button.setLed(ledMode);
  }, [button.setLed, ledMode]);

  const { showHoldToSpeakHint, idleRemindVisible, bumpActivity } = useHoldToSpeakHint({
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
    const enteredExtension =
      metaAgentPhase === "extension" && prevPhaseRef.current !== "extension";
    prevPhaseRef.current = metaAgentPhase;

    if (metaAgentPhase !== "extension") {
      setAwaitingExtensionReply(false);
      return;
    }
    if (enteredExtension) {
      bumpActivity();
      setAwaitingExtensionReply(true);
    }
  }, [metaAgentPhase, bumpActivity]);

  useEffect(() => {
    if (!awaitingExtensionReply || metaAgentPhase !== "extension") return;
    if (agentSpeaking) {
      setAwaitingExtensionReply(false);
    }
  }, [awaitingExtensionReply, metaAgentPhase, agentSpeaking]);

  useEffect(() => {
    if (connectionState !== "ready") return;

    if (metaAgentPhase === "inactive") {
      pendingSessionActivationRef.current = null;
      reconfigureSession();
      return;
    }

    if (metaAgentPhase === "extension") {
      pendingSessionActivationRef.current = "extension";
      reconfigureSession();
    }
  }, [metaAgentPhase, connectionState, reconfigureSession]);

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
    sendUserMessage(buildMetaAgentStateSnapshot(snapshotContext));
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
    participationPhase,
    currentSpeakerName,
    snapshotContext,
  ]);

  useEffect(() => {
    if (metaAgentPhase === "inactive") return;
    setMicEnabled(button.pressed);
  }, [button.pressed, metaAgentPhase, setMicEnabled]);

  useEffect(() => {
    if (metaAgentPhase === "inactive") {
      setMicEnabled(false);
    }
  }, [metaAgentPhase, setMicEnabled]);

  const idleTerminalFiredRef = useRef(false);

  useEffect(() => {
    if (metaAgentPhase === "inactive") {
      idleTerminalFiredRef.current = false;
    }
  }, [metaAgentPhase]);

  useEffect(() => {
    if (!idleRemindVisible) {
      idleTerminalFiredRef.current = false;
    }
  }, [idleRemindVisible]);

  useEffect(() => {
    if (metaAgentPhase !== "interruption" && metaAgentPhase !== "extension") return;
    if (connectionState !== "ready") return;
    if (!idleRemindVisible) return;
    if (idleTerminalFiredRef.current) return;
    if (agentSpeaking || button.pressed) return;

    const terminalTool =
      metaAgentPhase === "extension"
        ? toolHandlers.conclude_meeting
        : toolHandlers.resume_meeting;
    const eventName =
      metaAgentPhase === "extension"
        ? "idle auto-conclude conclude_meeting"
        : "idle auto-resume resume_meeting";

    const timerId = window.setTimeout(() => {
      if (idleTerminalFiredRef.current) return;
      if (agentSpeaking || button.pressed) return;
      idleTerminalFiredRef.current = true;
      log.event("META", eventName);
      terminalTool?.({});
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

  const showExtensionLoader =
    metaAgentPhase === "extension" &&
    (awaitingExtensionReply || connectionState !== "ready");

  return (
    <>
      {showExtensionLoader && <Loading />}
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
    </>
  );
}
