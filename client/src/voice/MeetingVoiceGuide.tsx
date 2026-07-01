import type { Topic } from "@shared/ModelTypes";
import { useEffect, useMemo } from "react";
import { useSwitchLanguage } from "@/routing";
import { useTranslation } from "react-i18next";
import VoiceGuideOverlay from "./VoiceGuideOverlay";
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
import { buildGuidePrompt } from "./guidePrompt";
import { createGuideToolHandlers, createGuideTools } from "./guideTools";
import { useButtonBanner } from "@/museum/button/useButtonBanner";
import Loading from "@main/Loading";
import { useVoiceGuide } from "./useVoiceGuide";
import { useErrorStore } from "@main/overlay/errorStore";

type MeetingVoiceGuideProps = {
  phase: MeetingSetupPhase;
  lastUserEvent: MeetingSetupUserEvent | null;
  onBeginSetup: () => void;
  onGoToTopicStep: () => void;
  onSelectTopic: (topic: Topic) => void;
  onStartMeeting: (characters: Character[]) => Promise<void> | void;
};

export default function MeetingVoiceGuide({
  phase,
  lastUserEvent,
  onBeginSetup,
  onGoToTopicStep,
  onSelectTopic,
  onStartMeeting,
}: MeetingVoiceGuideProps) {
  const { i18n, t } = useTranslation();
  const { isMuseumMode, agentMode } = useCouncilSettings();
  const { switchLanguage, otherLanguages } = useSwitchLanguage();
  const button = useButton("voice-guide");
  const connectionError = useErrorStore((s) => s.connectionError);
  const {
    selectedTopic,
    customTopic,
    visitorName,
  } = useMeetingSetupStore();

  const topicsBundle = useMemo(() => getTopicsBundle(i18n.language), [i18n.language]);
  const characterSetupBundle = useMemo(() => getCharacterSetupBundle(i18n.language), [i18n.language]);
  const guideLanguage = i18n.language.toLowerCase().startsWith("sv") ? "sv" : "en";

  const guideTopics = useMemo(() => {
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

  const guideCharacters = useMemo(() => {
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
    return buildGuidePrompt({
      language: guideLanguage,
      topics: guideTopics,
      characters: guideCharacters,
      phase,
      agentMode,
      visitorName,
      otherLanguageNames,
    });
  }, [guideCharacters, guideTopics, phase, guideLanguage, agentMode, visitorName, otherLanguageNames]);

  const voice = useVoiceGuide({
    language: guideLanguage,
    instructions,
    isMuseumMode,
    tools: createGuideTools({ otherLanguages }),
    toolHandlers: createGuideToolHandlers({
      topics: guideTopics,
      characters: guideCharacters,
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
      voiceGuideLanguage: i18n.language,
      meetingCharactersLabels: {
        formatHumanCount: (count) => t("meeting.characters.humanCount", { count }),
      },
      otherLanguages,
      switchLanguage,
    }),
    agentMode,
    micOpen: button.pressed,
  });
  const { sendUserMessage, muted } = voice;

  const showMuseumReconnecting =
    isMuseumMode && !muted && voice.isConnecting && !connectionError;

  useButtonBanner({
    owner: "voice-guide",
    sessionActive: agentMode === "ptt" && !muted,
    isConnecting: voice.isConnecting,
    micOpen: button.pressed,
    activityDeps: [voice.lastUserTranscript, voice.lastCaption],
  });

  const ledMode = useMemo((): ButtonLedMode => {
    if (agentMode !== "ptt" || muted || voice.isConnecting) return "off";
    if (button.pressed) return "on";
    return "pulse";
  }, [agentMode, muted, voice.isConnecting, button.pressed]);

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
    <VoiceGuideOverlay
      isConnecting={voice.isConnecting}
      lastCaption={voice.lastCaption}
      lastUserTranscript={voice.lastUserTranscript}
      muted={voice.muted}
      isMuseumMode={isMuseumMode}
      agentMode={agentMode}
      subtitleLayout={isMuseumMode ? "council" : "compact"}
      micStream={voice.micStream}
      micActive={agentMode === "ptt" && !muted && button.pressed}
      onStart={voice.start}
      onStop={voice.stop}
    />
    </>
  );
}
