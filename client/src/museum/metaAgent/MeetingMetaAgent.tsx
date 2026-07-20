import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useButton, type ButtonLedMode } from "@museum/button/useButton";
import { useButtonBanner } from "@museum/button/useButtonBanner";
import RealtimeCaptionOverlay from "@realtime/RealtimeCaptionOverlay";
import Loading from "@main/Loading";
import { useMetaAgent, type MetaAgentPhase } from "./useMetaAgent";
import { useErrorStore, setConnectionError } from "@main/overlay/errorStore";
import {
  buildExtensionActivationTurn,
  buildExtensionAgentPrompt,
  buildExtensionStateSnapshot,
  buildMetaAgentPrompt,
  buildMetaAgentActivationTurn,
  buildMetaAgentStateSnapshot,
  getMetaAgentBundle,
  type MetaAgentPromptBundle,
  type MetaAgentStateSnapshot,
} from "./metaAgentPrompt";
import {
  createExtensionAgentToolHandlers,
  createExtensionAgentTools,
  createMetaAgentTools,
  createMetaAgentToolHandlers,
} from "./metaAgentTools";
import type { RealtimeFunctionTool, ToolHandler } from "@realtime/realtimeTools";
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

/**
 * The agent has two active configurations — "interruption" (default: loaded
 * whenever the agent isn't in the soft-cap extension phase, including while
 * inactive) and "extension" (soft-cap: extend vs conclude). Everything that
 * differs between them — prompt, tools, activation copy, idle-terminal tool —
 * is keyed here so the component reads as one flow instead of six scattered
 * `phase === "extension"` branches.
 */
type MetaAgentPhaseKey = "interruption" | "extension";

function phaseKey(phase: MetaAgentPhase): MetaAgentPhaseKey {
  return phase === "extension" ? "extension" : "interruption";
}

type SharedToolHandlerCtx = {
  setMetaAgentPhase: (phase: MetaAgentPhase) => void;
  silenceAgentOutput: () => void;
  reconfigureSession: () => void;
};

type ToolHandlerCallbacks = {
  onRestartMeeting: () => void;
  onExtendMeeting: () => void;
  onConcludeMeeting: () => void;
};

const PHASE_AGENT_CONFIG: Record<
  MetaAgentPhaseKey,
  {
    buildInstructions: (bundle: MetaAgentPromptBundle) => string;
    buildTools: (bundle: MetaAgentPromptBundle) => RealtimeFunctionTool[];
    buildToolHandlers: (
      shared: SharedToolHandlerCtx,
      callbacks: ToolHandlerCallbacks,
    ) => Record<string, ToolHandler>;
    buildStateSnapshot: (snapshot: MetaAgentStateSnapshot) => string;
    buildActivationTurn: () => string;
    /** Interruption opens the mic immediately; extension waits for the visitor's reply. */
    micOnActivate: boolean;
    idleTerminalTool: "resume_meeting" | "conclude_meeting";
    idleTerminalEventName: string;
  }
> = {
  interruption: {
    buildInstructions: (bundle) => buildMetaAgentPrompt({ bundle, agentMode: "ptt" }),
    buildTools: (bundle) => createMetaAgentTools({ promptBundle: bundle }),
    buildToolHandlers: (shared, { onRestartMeeting }) =>
      createMetaAgentToolHandlers({ ...shared, onRestartMeeting }),
    buildStateSnapshot: buildMetaAgentStateSnapshot,
    buildActivationTurn: buildMetaAgentActivationTurn,
    micOnActivate: true,
    idleTerminalTool: "resume_meeting",
    idleTerminalEventName: "idle auto-resume resume_meeting",
  },
  extension: {
    buildInstructions: (bundle) => buildExtensionAgentPrompt({ bundle, agentMode: "ptt" }),
    buildTools: (bundle) => createExtensionAgentTools({ promptBundle: bundle }),
    buildToolHandlers: (shared, { onExtendMeeting, onConcludeMeeting }) =>
      createExtensionAgentToolHandlers({ ...shared, onExtendMeeting, onConcludeMeeting }),
    buildStateSnapshot: buildExtensionStateSnapshot,
    buildActivationTurn: buildExtensionActivationTurn,
    micOnActivate: false,
    idleTerminalTool: "conclude_meeting",
    idleTerminalEventName: "idle auto-conclude conclude_meeting",
  },
};

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
  const connectionError = useErrorStore((s) => s.connectionError);
  const button = useButton("meta-agent");

  // Track whether the agent is currently unreachable so we can defer showing
  // the connection error until the visitor actually tries to use the agent.
  const agentDownRef = useRef(false);

  const onConnectionLost = useCallback(() => {
    agentDownRef.current = true;
    // Don't surface the error yet — meeting may be playing fine without the agent.
  }, []);

  const onConnectionRestored = useCallback(() => {
    agentDownRef.current = false;
    setConnectionError("meta-agent", false);
  }, []);

  const promptBundle = useMemo(() => getMetaAgentBundle(language), [language]);
  const activeConfig = PHASE_AGENT_CONFIG[phaseKey(metaAgentPhase)];

  const instructions = useMemo(
    () => activeConfig.buildInstructions(promptBundle),
    [activeConfig, promptBundle],
  );

  const tools = useMemo(
    () => activeConfig.buildTools(promptBundle),
    [activeConfig, promptBundle],
  );

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
    const shared: SharedToolHandlerCtx = {
      setMetaAgentPhase,
      silenceAgentOutput: () => silenceRef.current(),
      reconfigureSession: () => reconfigureRef.current(),
    };
    return activeConfig.buildToolHandlers(shared, { onRestartMeeting, onExtendMeeting, onConcludeMeeting });
  }, [activeConfig, setMetaAgentPhase, onRestartMeeting, onExtendMeeting, onConcludeMeeting]);

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
    onConnectionLost,
    onConnectionRestored,
  });

  useEffect(() => {
    if (connectionState === "ready") {
      agentDownRef.current = false;
      setConnectionError("meta-agent", false);
    }
  }, [connectionState]);

  // Shared activation sequence: unmute, gate the mic per phase default, log,
  // send the STATE SYNC snapshot + activation turn, and ask for a response.
  const activateAgent = useCallback(
    (key: MetaAgentPhaseKey) => {
      const cfg = PHASE_AGENT_CONFIG[key];
      setAgentOutputMuted(false);
      setMicEnabled(cfg.micOnActivate);
      log.event("META", "activate", {
        metaAgentPhase: key,
        councilState,
        participationPhase,
        currentSpeakerName,
      });
      sendUserMessage(cfg.buildStateSnapshot(snapshotContext));
      sendUserMessage(cfg.buildActivationTurn());
      requestAgentResponse();
    },
    [
      setAgentOutputMuted,
      setMicEnabled,
      sendUserMessage,
      requestAgentResponse,
      councilState,
      participationPhase,
      currentSpeakerName,
      snapshotContext,
    ],
  );

  useEffect(() => {
    onSessionReadyRef.current = () => {
      if (pendingSessionActivationRef.current === "extension") {
        pendingSessionActivationRef.current = null;
        activateAgent("extension");
      }
    };
  }, [activateAgent]);

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
      const cfg = PHASE_AGENT_CONFIG[phaseKey(metaAgentPhase)];
      log.event("META", cfg.idleTerminalEventName);
      toolHandlers[cfg.idleTerminalTool]?.({});
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

  // Only "extension" needs its tools/instructions swapped in before activating —
  // "interruption" reuses whatever is already loaded, so it activates inline
  // (see the button-press effect below) without waiting on a reconfigure.
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
      setConnectionError("meta-agent", true);
      return;
    }

    setMetaAgentPhase("interruption");
    activateAgent("interruption");
  }, [button.pressed, metaAgentPhase, setMetaAgentPhase, activateAgent]);

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
    !connectionError &&
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
