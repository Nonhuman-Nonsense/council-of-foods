import type { Topic } from "@shared/ModelTypes";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSwitchLanguage } from "@/navigation";
import { useTranslation } from "react-i18next";
import SetupAgentOverlay from "./SetupAgentOverlay";
import { getTopicsBundle } from "@main/topicsBundle";
import { getCharacterSetupBundle } from "@newMeeting/CharacterSetup";
import type { Character } from "@shared/ModelTypes";
import {
  buildMeetingSetupSyncMessage,
  buildTopicFromSelection,
  type MeetingSetupPhase,
  type MeetingSetupUserEvent,
} from "@newMeeting/meetingSetup";
import { useMeetingSetupStore } from "@newMeeting/meetingSetupStore";
import { useButton, type ButtonLedMode } from "@/museum/button/useButton";
import { useCouncilSettings } from "@/settings/councilSettings";
import { buildSetupAgentPrompt } from "./setupAgentPrompt";
import { createSetupAgentToolHandlers, createSetupAgentTools } from "./setupAgentTools";
import { useInactivityNudge } from "./useInactivityNudge";
import { useButtonBanner } from "@/museum/button/useButtonBanner";
import Loading from "@main/Loading";
import { useSetupAgent } from "./useSetupAgent";
import { useErrorStore } from "@main/overlay/errorStore";
import { useDocumentVisibility } from "@/utils";

type MeetingSetupAgentProps = {
  phase: MeetingSetupPhase;
  lastUserEvent: MeetingSetupUserEvent | null;
  onBeginSetup: () => void;
  onGoToTopicStep: () => void;
  onSelectTopic: (topic: Topic) => void;
  onStartMeeting: (characters: Character[]) => Promise<void> | void;
};

export default function MeetingSetupAgent({
  phase,
  lastUserEvent,
  onBeginSetup,
  onGoToTopicStep,
  onSelectTopic,
  onStartMeeting,
}: MeetingSetupAgentProps) {
  const { i18n, t } = useTranslation();
  const { isMuseumMode, agentMode } = useCouncilSettings();
  const { switchLanguage, otherLanguages } = useSwitchLanguage();
  const button = useButton("setup-agent");
  const connectionError = useErrorStore((s) => s.connectionError);
  const {
    selectedTopic,
    customTopic,
    visitorName,
  } = useMeetingSetupStore();

  const topicsBundle = useMemo(() => getTopicsBundle(i18n.language), [i18n.language]);
  const characterSetupBundle = useMemo(() => getCharacterSetupBundle(i18n.language), [i18n.language]);
  const agentLanguage = i18n.language.toLowerCase().startsWith("sv") ? "sv" : "en";

  const setupTopics = useMemo(() => {
    return [
      ...topicsBundle.topics.map((topic: Topic) => ({
        id: topic.id,
        title: topic.title,
        description: topic.description,
      })),
      {
        id: topicsBundle.custom_topic.id,
        title: topicsBundle.custom_topic.title,
        description: "",
      },
    ];
  }, [topicsBundle]);

  const setupCharacters = useMemo(() => {
    return characterSetupBundle.characters.map((character: Character) => ({
      id: character.id,
      name: character.name,
      description: character.description,
    }));
  }, [characterSetupBundle]);

  const LANGUAGE_DISPLAY_NAMES: Record<string, string> = { en: "English", sv: "Swedish" };
  const otherLanguageNames = useMemo(
    () => otherLanguages.map((lang) => LANGUAGE_DISPLAY_NAMES[lang] ?? lang),
    [otherLanguages],
  );

  const instructions = useMemo(() => {
    return buildSetupAgentPrompt({
      language: agentLanguage,
      topics: setupTopics,
      characters: setupCharacters,
      phase,
      agentMode,
      visitorName,
      otherLanguageNames,
    });
  }, [setupCharacters, setupTopics, phase, agentLanguage, agentMode, visitorName, otherLanguageNames]);

  const agent = useSetupAgent({
    language: agentLanguage,
    instructions,
    isMuseumMode,
    tools: createSetupAgentTools({ otherLanguages, topics: setupTopics, characters: setupCharacters, agentMode, isWebMode: !isMuseumMode }),
    toolHandlers: createSetupAgentToolHandlers({
      topics: setupTopics,
      characters: setupCharacters,
      beginSetup: onBeginSetup,
      goToTopicStep: onGoToTopicStep,
      buildSelectedTopic: () =>
        buildTopicFromSelection({
          topicsBundle,
          selectedTopicId: selectedTopic,
          customTopic,
        }),
      selectTopic: onSelectTopic,
      startMeeting: onStartMeeting,
      meetingStep: phase,
      setupAgentLanguage: i18n.language,
      meetingCharactersLabels: {
        formatHumanCount: (count) => t("meeting.characters.humanCount", { count }),
      },
      otherLanguages,
      switchLanguage,
    }),
    agentMode,
    micOpen: button.pressed,
  });
  const { sendUserMessage, muted } = agent;
  const isDocumentVisible = useDocumentVisibility();

  const [nudgeFired, setNudgeFired] = useState(false);

  // Stop nudging while the tab is hidden.
  useInactivityNudge({
    agentSpeaking: agent.agentSpeaking,
    lastUserTranscript: agent.lastUserTranscript,
    sendMessage: sendUserMessage,
    requestResponse: agent.requestAgentResponse,
    delayMs: 10_000,
    enabled: !agent.isConnecting && !muted && isDocumentVisible,
    onNudgeFired: () => setNudgeFired(true),
    message:
      phase === "landing"
        ? "The visitor is quiet. Gently prompt them to respond to you."
        : "The visitor has been quiet for a while. Check in with them — ask if they need help or have a question.",
  });

  // Shared flag: set whenever we tear down the session due to the user being away
  // (tab hidden for 60s, or no speech for 3 min). Cleared on resume.
  const stoppedByBackgroundRef = useRef(false);

  // Handle tab visibility changes:
  // - Hidden: start a grace timer; if still hidden after 60s, tear down the session.
  // - Visible again after teardown: auto-resume (opening greeting plays automatically).
  // - Visible again within grace period: send an immediate refocus message.
  const HIDDEN_GRACE_MS = 60_000;
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) { hasMountedRef.current = true; return; }

    if (!isDocumentVisible) {
      const id = setTimeout(() => {
        stoppedByBackgroundRef.current = true;
        agent.stop();
      }, HIDDEN_GRACE_MS);
      return () => clearTimeout(id);
    }

    if (stoppedByBackgroundRef.current) {
      stoppedByBackgroundRef.current = false;
      void agent.start();
    } else if (!muted && !agent.isConnecting && !agent.agentSpeaking) {
      sendUserMessage(
        phase === "landing"
          ? "The visitor has returned after a brief absence. Welcome them back and invite them to continue."
          : "The visitor has returned after a brief absence. Check in warmly and help them pick up where they left off.",
      );
      agent.requestAgentResponse();
      setNudgeFired(true);
    }
   
  }, [isDocumentVisible]);

  // Absolute idle timer: if no user speech for 3 minutes, tear down the session.
  // Covers the case where the tab stays visible but the user has switched to another app.
  const IDLE_TIMEOUT_MS = 3 * 60_000;
  useEffect(() => {
    if (muted) return;
    const id = setTimeout(() => {
      stoppedByBackgroundRef.current = true;
      agent.stop();
    }, IDLE_TIMEOUT_MS);
    return () => clearTimeout(id);
   
  }, [agent.lastUserTranscript, muted]);

  // Resume on window focus if the session was torn down by the background timer.
  // This handles returning from another app without switching tabs.
  useEffect(() => {
    function onWindowFocus() {
      if (!stoppedByBackgroundRef.current) return;
      stoppedByBackgroundRef.current = false;
      void agent.start();
    }
    window.addEventListener("focus", onWindowFocus);
    return () => window.removeEventListener("focus", onWindowFocus);
   
  }, []);

  const showMuseumReconnecting =
    isMuseumMode && !muted && agent.isConnecting && !connectionError;

  const { bumpBannerActivity } = useButtonBanner({
    owner: "setup-agent",
    sessionActive: agentMode === "ptt" && !muted,
    isConnecting: agent.isConnecting,
    micOpen: button.pressed,
    agentSpeaking: agent.agentSpeaking && !nudgeFired,
  });

  // Falling-edge only: bump the idle clock when the agent finishes speaking so
  // the 10s countdown starts from that moment. Rising edge is suppressed by
  // agentSpeaking prop above so the banner can't show while the agent talks.
  // Nudge guard: skip the bump during a nudge response so the banner stays visible.
  useEffect(() => {
    if (agent.agentSpeaking || nudgeFired) return;
    bumpBannerActivity();
  }, [agent.agentSpeaking, nudgeFired, bumpBannerActivity]);

  // Real user input clears the nudge override and bumps the idle clock.
  useEffect(() => {
    if (!agent.lastUserTranscript) return;
    setNudgeFired(false);
    bumpBannerActivity();
  }, [agent.lastUserTranscript, bumpBannerActivity]);

  useEffect(() => {
    if (!button.pressed) return;
    setNudgeFired(false);
    bumpBannerActivity();
  }, [button.pressed, bumpBannerActivity]);

  const ledMode = useMemo((): ButtonLedMode => {
    if (agentMode !== "ptt" || muted || agent.isConnecting) return "off";
    if (button.pressed) return "on";
    return "pulse";
  }, [agentMode, muted, agent.isConnecting, button.pressed]);

  useEffect(() => {
    if (agentMode !== "ptt") return;
    button.claim();
    return () => button.release();
  }, [button.claim, button.release, agentMode]);

  useEffect(() => {
    if (agentMode !== "ptt") return;
    button.setLed(ledMode);
  }, [button.setLed, agentMode, ledMode]);

  useEffect(() => {
    if (!lastUserEvent) {
      return;
    }

    const timer = setTimeout(() => {
      sendUserMessage(buildMeetingSetupSyncMessage(lastUserEvent));
    }, 1000);

    return () => clearTimeout(timer);
  }, [lastUserEvent, sendUserMessage]);

  return (
    <>
      {showMuseumReconnecting && <Loading />}
    <SetupAgentOverlay
      isConnecting={agent.isConnecting}
      lastCaption={agent.lastCaption}
      lastUserTranscript={agent.lastUserTranscript}
      muted={agent.muted}
      isMuseumMode={isMuseumMode}
      agentMode={agentMode}
      subtitleLayout={isMuseumMode ? "council" : "compact"}
      micStream={agent.micStream}
      micActive={agentMode === "ptt" && !muted && button.pressed}
      onStart={agent.start}
      onStop={agent.stop}
    />
    </>
  );
}
