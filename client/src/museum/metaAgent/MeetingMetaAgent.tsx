import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useButton, type ButtonLedMode } from "@museum/button/useButton";
import { useButtonBanner } from "@museum/button/useButtonBanner";
import RealtimeCaptionOverlay from "@realtime/RealtimeCaptionOverlay";
import Loading from "@main/Loading";
import { useMetaAgent, type MetaAgentPhase } from "./useMetaAgent";
import type { SetUnrecoverableError } from "@main/overlay/CouncilError";
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
  setUnrecoverableError?: SetUnrecoverableError;
  /** Called with true when a connection error should be surfaced, false to clear it. */
  setConnectionError?: (active: boolean) => void;
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
  setUnrecoverableError,
  setConnectionError,
}: MeetingMetaAgentProps) {
  const button = useButton("meta-agent");

  // Track whether the agent is currently unreachable so we can defer showing
  // the connection error until the visitor actually tries to use the agent.
  const agentDownRef = useRef(false);
  const setConnectionErrorRef = useRef(setConnectionError);
  useEffect(() => { setConnectionErrorRef.current = setConnectionError; });

  const onConnectionLost = useCallback(() => {
    agentDownRef.current = true;
    // Don't surface the error yet — meeting may be playing fine without the agent.
  }, []);

  const onConnectionRestored = useCallback(() => {
    agentDownRef.current = false;
    setConnectionErrorRef.current?.(false);
  }, []);

  const onFatalError = useCallback((e: { message: string; source: string; cause?: unknown }) => {
    setUnrecoverableError?.({ message: e.message, source: e.source, cause: e.cause });
  }, [setUnrecoverableError]);

  const promptBundle = useMemo(() => getMetaAgentBundle(language), [language]);

  const instructions = useMemo(() => {
    if (metaAgentPhase === "extension") {
      return buildExtensionAgentPrompt({ bundle: promptBundle, agentMode: "ptt" });
    }
    return buildMetaAgentPrompt({ bundle: promptBundle, agentMode: "ptt" });
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
    onFatalError,
    onConnectionLost,
    onConnectionRestored,
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

  const { bumpBannerActivity } = useButtonBanner({
    owner: "meta-agent",
    sessionActive: metaAgentPhase !== "inactive",
    isConnecting: connectionState === "connecting",
    micOpen: metaAgentPhase !== "inactive" && button.pressed,
    activityDeps: [lastUserTranscript, lastCaption],
    onIdleTerminal: () => {
      const terminalTool =
        metaAgentPhase === "extension"
          ? toolHandlers.conclude_meeting
          : toolHandlers.resume_meeting;
      const eventName =
        metaAgentPhase === "extension"
          ? "idle auto-conclude conclude_meeting"
          : "idle auto-resume resume_meeting";
      log.event("META", eventName);
      terminalTool?.({});
    },
    canIdleTerminal: () =>
      (metaAgentPhase === "interruption" || metaAgentPhase === "extension") &&
      connectionState === "ready" &&
      !agentSpeaking &&
      !button.pressed,
    terminalDeps: [metaAgentPhase, connectionState, agentSpeaking, button.pressed],
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
      bumpBannerActivity();
      setAwaitingExtensionReply(true);
    }
  }, [metaAgentPhase, bumpBannerActivity]);

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

    // If the agent is down when the visitor presses the button, surface the
    // connection error now — this is when the drop actually affects the UX.
    if (agentDownRef.current || connectionState !== "ready") {
      setConnectionErrorRef.current?.(true);
      return;
    }

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

  if (metaAgentPhase === "inactive") return null;

  const showExtensionLoader =
    metaAgentPhase === "extension" &&
    (awaitingExtensionReply || connectionState !== "ready");

  return (
    <>
      {showExtensionLoader && <Loading />}
      <RealtimeCaptionOverlay
        lastCaption={lastCaption}
        lastUserTranscript={lastUserTranscript}
        subtitleLayout="council"
        showPttVisualizer
        micStream={micStream}
        micActive={button.pressed}
      />
    </>
  );
}
