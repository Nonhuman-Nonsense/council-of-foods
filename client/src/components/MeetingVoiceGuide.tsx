import type { Topic } from "@shared/ModelTypes";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import VoiceGuideOverlay from "@/components/VoiceGuideOverlay";
import { getTopicsBundle } from "@/components/topicsBundle";
import { getFoodsBundle } from "@/components/settings/FoodUtils";
import type { Food } from "@/components/settings/FoodUtils";
import { buildTopicFromSelection } from "@/meetingSetup/meetingSetup";
import { useMeetingSetupStore } from "@/stores/useMeetingSetupStore";
import { buildGuidePrompt } from "@/voice/guidePrompt";
import { createGuideToolHandlers, createGuideTools } from "@/voice/guideTools";
import { useVoiceGuide } from "@/voice/useVoiceGuide";
import voiceGuidePromptEn from "@shared/prompts/voice_guide_en.json";

type MeetingVoiceGuideProps = {
  step: "topic" | "foods";
  onConfirmTopic: (topic: Topic) => void;
  onStartMeeting: (foods: Food[]) => Promise<void> | void;
};

export default function MeetingVoiceGuide({
  step,
  onConfirmTopic,
  onStartMeeting,
}: MeetingVoiceGuideProps) {
  const { i18n, t } = useTranslation();
  const {
    selectedTopic,
    customTopic,
    selectedFoods,
    humans,
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
      buildSelectedTopic: () =>
        buildTopicFromSelection({
          topicsBundle,
          selectedTopicId: selectedTopic,
          customTopic,
        }),
      confirmTopic: onConfirmTopic,
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
    const timer = setTimeout(() => {
      if (step === "topic" && selectedTopic) {
        const topicName =
          selectedTopic === topicsBundle.custom_topic.id
            ? customTopic
            : guideTopics.find((topic) => topic.id === selectedTopic)?.title;
        if (topicName) {
          sendUserMessage(`(SYSTEM SYNC: User selected topic "${topicName}")`);
        }
        return;
      }

      if (step === "foods") {
        const names = selectedFoods
          .map((id) => {
            if (id.startsWith("panelist")) {
              const index = parseInt(id.replace("panelist", ""), 10);
              return humans[index]?.name || `Human ${index + 1}`;
            }
            return guideFoods.find((food) => food.id === id)?.name;
          })
          .filter(Boolean);
        sendUserMessage(`(SYSTEM SYNC: Current participants: ${names.join(", ")})`);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [customTopic, guideFoods, guideTopics, humans, selectedFoods, selectedTopic, sendUserMessage, step, topicsBundle]);

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
