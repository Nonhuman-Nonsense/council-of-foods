import type { Topic } from "@shared/ModelTypes";
import { useEffect, useMemo } from "react";
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
import { useMeetingSetupStore } from "@stores/useMeetingSetupStore";
import { usePushToTalkStore } from "@stores/usePushToTalkStore";
import { getPushToTalk } from "@/settings/councilSettings";
import { buildGuidePrompt } from "./guidePrompt";
import { createGuideToolHandlers, createGuideTools } from "./guideTools";
import { useVoiceGuide } from "./useVoiceGuide";
import voiceGuidePromptEn from "@shared/prompts/voice_guide_en.json";
import voiceGuidePromptSv from "@shared/prompts/voice_guide_sv.json";

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
  const pushToTalkMode = getPushToTalk();
  const pressed = usePushToTalkStore((state) => state.pressed);
  const setLed = usePushToTalkStore((state) => state.setLed);
  const {
    selectedTopic,
    customTopic,
  } = useMeetingSetupStore();

  const topicsBundle = useMemo(() => getTopicsBundle(i18n.language), [i18n.language]);
  const characterSetupBundle = useMemo(() => getCharacterSetupBundle(i18n.language), [i18n.language]);
  const guideLanguage = i18n.language.toLowerCase().startsWith("sv") ? "sv" : "en";
  const promptBundle = guideLanguage === "sv" ? voiceGuidePromptSv : voiceGuidePromptEn;

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

  const instructions = useMemo(() => {
    return buildGuidePrompt({
      bundle: promptBundle,
      topics: guideTopics,
      characters: guideCharacters,
      phase,
      pushToTalkMode,
    });
  }, [guideCharacters, guideTopics, phase, promptBundle, pushToTalkMode]);

  const voice = useVoiceGuide({
    language: guideLanguage,
    instructions,
    tools: createGuideTools({ promptBundle }),
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
        oneHuman: t("selectfoods.human"),
        twoHumansSuffix: t("selectfoods.twohumans"),
      },
    }),
    pushToTalkMode,
    micOpen: pressed,
  });
  const { sendUserMessage, muted } = voice;

  useEffect(() => {
    if (!pushToTalkMode || muted) {
      void setLed(false);
      return;
    }
    void setLed(pressed);
  }, [pushToTalkMode, muted, pressed, setLed]);

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
    <VoiceGuideOverlay
      isConnecting={voice.isConnecting}
      error={voice.error}
      lastCaption={voice.lastCaption}
      lastUserTranscript={voice.lastUserTranscript}
      muted={voice.muted}
      pushToTalkMode={pushToTalkMode}
      micOpen={pressed}
      onStart={voice.start}
      onStop={voice.stop}
    />
  );
}
