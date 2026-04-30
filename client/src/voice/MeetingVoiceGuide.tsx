import type { Topic } from "@shared/ModelTypes";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import VoiceGuideOverlay from "@/components/VoiceGuideOverlay";
import { getTopicsBundle } from "@/components/topicsBundle";
import { getFoodsBundle } from "@/components/settings/FoodUtils";
import type { Food } from "@/components/settings/FoodUtils";
import { buildMeetingSetupSyncMessage, buildTopicFromSelection, type MeetingSetupUserEvent } from "@/meetingSetup/meetingSetup";
import { useMeetingSetupStore } from "@/stores/useMeetingSetupStore";
import { buildGuidePrompt } from "@/voice/guidePrompt";
import { createGuideToolHandlers, createGuideTools } from "@/voice/guideTools";
import { useVoiceGuide } from "@/voice/useVoiceGuide";
import voiceGuidePromptEn from "@shared/prompts/voice_guide_en.json";

type MeetingVoiceGuideProps = {
  step: "topic" | "foods";
  lastUserEvent: MeetingSetupUserEvent | null;
  onGoToTopicStep: () => void;
  onSelectTopic: (topic: Topic) => void;
  onStartMeeting: (foods: Food[]) => Promise<void> | void;
};

export default function MeetingVoiceGuide({
  step,
  lastUserEvent,
  onGoToTopicStep,
  onSelectTopic,
  onStartMeeting,
}: MeetingVoiceGuideProps) {
  const { i18n, t } = useTranslation();
  const {
    selectedTopic,
    customTopic,
  } = useMeetingSetupStore();

  const topicsBundle = useMemo(() => getTopicsBundle(i18n.language), [i18n.language]);
  const foodsBundle = useMemo(() => getFoodsBundle(i18n.language), [i18n.language]);

  const guideTopics = useMemo(() => {
    return [
      ...topicsBundle.topics.map((topic) => ({
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

  const guideFoods = useMemo(() => {
    return foodsBundle.foods.map((food) => ({
      id: food.id,
      name: food.name,
      description: food.description,
    }));
  }, [foodsBundle]);

  const instructions = useMemo(() => {
    return buildGuidePrompt({
      baseSystemPrompt: voiceGuidePromptEn.system,
      projectDescription:
        "Council of Foods is a political arena where foods debate the broken food system. " +
        "In this setup wizard, the visitor chooses a topic and selects food characters (and optionally human panelists) to join the council.",
      topics: guideTopics,
      foods: guideFoods,
    });
  }, [guideFoods, guideTopics]);

  const voice = useVoiceGuide({
    instructions,
    tools: createGuideTools({ topics: guideTopics, foods: guideFoods }),
    toolHandlers: createGuideToolHandlers({
      topics: guideTopics,
      foods: guideFoods,
      goToTopicStep: onGoToTopicStep,
      buildSelectedTopic: () =>
        buildTopicFromSelection({
          topicsBundle,
          selectedTopicId: selectedTopic,
          customTopic,
        }),
      selectTopic: onSelectTopic,
      startMeeting: onStartMeeting,
      meetingStep: step,
      voiceGuideLanguage: i18n.language,
      meetingFoodsLabels: {
        oneHuman: t("selectfoods.human"),
        twoHumansSuffix: t("selectfoods.twohumans"),
      },
    }),
  });
  const { sendUserMessage } = voice;

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
      onToggleMuted={() => voice.setMuted(!voice.muted)}
    />
  );
}
