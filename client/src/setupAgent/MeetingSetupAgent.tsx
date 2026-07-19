import type { Topic } from "@shared/ModelTypes";
import { useEffect, useMemo } from "react";
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
import { useAgentPresence } from "./useAgentPresence";
import { useButtonBanner } from "@/museum/button/useButtonBanner";
import Loading from "@main/Loading";
import { useSetupAgent } from "./useSetupAgent";
import { useErrorStore } from "@main/overlay/errorStore";

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
  const { nudgeFired, clearNudge } = useAgentPresence({ agent, phase });

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

  // Real user input bumps the idle clock (nudge override is cleared by useAgentPresence).
  useEffect(() => {
    if (!agent.lastUserTranscript) return;
    bumpBannerActivity();
  }, [agent.lastUserTranscript, bumpBannerActivity]);

  useEffect(() => {
    if (!button.pressed) return;
    clearNudge();
    bumpBannerActivity();
  }, [button.pressed, clearNudge, bumpBannerActivity]);

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
