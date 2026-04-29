import type { Topic } from "@shared/ModelTypes";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import SelectTopic from "./settings/SelectTopic";
import SelectFoods, { getFoodsBundle, Food } from "./settings/SelectFoods";
import { createMeeting } from "@/api/createMeeting";
import { useRouting } from "@/routing";
import VoiceGuideOverlay from "@/components/VoiceGuideOverlay";
import { buildGuidePrompt } from "@/voice/guidePrompt";
import { useVoiceGuide } from "@/voice/useVoiceGuide";
import { getTopicsBundle } from "@/components/topicsBundle";
import voiceGuidePromptEn from "@shared/prompts/voice_guide_en.json";
import { createGuideToolHandlers, createGuideTools } from "@/voice/guideTools";
import { useMeetingSetupStore } from "@/stores/useMeetingSetupStore";

export interface NewMeetingProps {
  setUnrecoverableError: (message: string) => void;
  topicSelection: Topic | null;
  setTopicSelection: (topic: Topic) => void;
  setMeetingliveKey: (key: string) => void;
}

export default function NewMeeting({
  setUnrecoverableError,
  topicSelection,
  setTopicSelection,
  setMeetingliveKey,
}: NewMeetingProps) {
  const navigate = useNavigate();
  const { i18n, t } = useTranslation();
  const { meetingPath } = useRouting();
  const [step, setStep] = useState<"topic" | "foods">(() =>
    // If a topic has been selected, go to the foods step, eg. on reset
    topicSelection != null ? "foods" : "topic"
  );
  const [creating, setCreating] = useState(false);

  // Setup state from store
  const {
    selectedTopic, setSelectedTopic,
    customTopic, setCustomTopic,
    selectedFoods,
    humans,
  } = useMeetingSetupStore();

  // Keep lifted topic UI state consistent if we start on foods step (e.g. reset flow)
  useEffect(() => {
    if (!topicSelection) return;
    setSelectedTopic(topicSelection.id);
    if (topicSelection.id === "customtopic") {
      setCustomTopic(topicSelection.description ?? "");
    } else {
      setCustomTopic("");
    }
  }, [topicSelection?.id, topicSelection?.description, setSelectedTopic, setCustomTopic]);

  const topicsBundle = useMemo(() => getTopicsBundle(i18n.language), [i18n.language]);
  const foodsBundle = useMemo(() => getFoodsBundle(i18n.language), [i18n.language]);

  const guideTopics = useMemo(() => {
    return [
      ...topicsBundle.topics.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
      })),
      { id: topicsBundle.custom_topic.id, title: topicsBundle.custom_topic.title, description: "" },
    ];
  }, [topicsBundle]);

  const guideFoods = useMemo(() => {
    return foodsBundle.foods.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
    }));
  }, [foodsBundle]);

  const guideInstructions = useMemo(() => {
    return buildGuidePrompt({
      baseSystemPrompt: voiceGuidePromptEn.system,
      projectDescription:
        "Council of Foods is a political arena where foods debate the broken food system. " +
        "In this setup wizard, the visitor chooses a topic and selects food characters (and optionally human panelists) to join the council.",
      topics: guideTopics,
      foods: guideFoods,
    });
  }, [guideFoods, guideTopics]);

  function buildSelectedTopicFromUi(): Topic {
    const id = selectedTopic;
    const raw =
      topicsBundle.topics.find((t) => t.id === id) ??
      (id === topicsBundle.custom_topic.id ? topicsBundle.custom_topic : undefined);
    if (!raw) throw new Error(`Topic not found: ${id}`);
    const built = structuredClone(raw);
    if (built.id === topicsBundle.custom_topic.id) {
      built.prompt = customTopic;
      built.description = customTopic;
    }
    built.prompt = topicsBundle.system.replace("[TOPIC]", built.prompt);
    return built;
  }

  function handleTopicContinue(selectedTopic: Topic) {
    setTopicSelection(selectedTopic);
    setStep("foods");
  }

  async function handleFoodsContinue({ foods }: { foods: Food[] }) {
    if (!topicSelection) {
      console.error("NewMeeting: missing topic when creating meeting");
      return;
    }
    setCreating(true);
    try {
      const { meetingId, liveKey } = await createMeeting({
        topic: topicSelection,
        characters: foods,
        language: i18n.language,
      });
      setMeetingliveKey(liveKey);
      navigate(meetingPath(Number(meetingId)));
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error && e.message.trim().length > 0 ? e.message : t("error.1");
      setUnrecoverableError(msg);
    } finally {
      setCreating(false);
    }
  }

  const voice = useVoiceGuide({
    instructions: guideInstructions,
    tools: createGuideTools({ topics: guideTopics, foods: guideFoods }),
    toolHandlers: createGuideToolHandlers({
      topics: guideTopics,
      foods: guideFoods,
      buildSelectedTopicFromUi,
      confirmTopic: (topic: Topic) => handleTopicContinue(topic),
      startMeeting: async (foods: Food[]) => {
        await handleFoodsContinue({ foods });
      },
      meetingStep: step,
      voiceGuideLanguage: i18n.language,
      meetingFoodsLabels: {
        oneHuman: t("selectfoods.human"),
        twoHumansSuffix: t("selectfoods.twohumans"),
      },
    }),
  });

  // Sync state changes back to the voice agent so it "sees" what the user is doing.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (step === 'topic' && selectedTopic) {
        const topicName = selectedTopic === 'customtopic' ? customTopic : guideTopics.find(t => t.id === selectedTopic)?.title;
        if (topicName) {
          voice.sendUserMessage(`(SYSTEM SYNC: User selected topic "${topicName}")`);
        }
      } else if (step === 'foods') {
        const names = selectedFoods.map(id => {
          if (id.startsWith('panelist')) {
            const idx = parseInt(id.replace('panelist', ''));
            return (humans[idx] as any)?.name || `Human ${idx + 1}`;
          }
          return guideFoods.find(f => f.id === id)?.name;
        }).filter(Boolean);
        voice.sendUserMessage(`(SYSTEM SYNC: Current participants: ${names.join(', ')})`);
      }
    }, 1000); // Debounce sync by 1s
    return () => clearTimeout(timer);
  }, [selectedTopic, customTopic, selectedFoods, humans, step]);


  return (
    <>
      {step === "topic" && (
        <SelectTopic
          currentTopic={topicSelection ?? undefined}
          onContinueForward={handleTopicContinue}
        />
      )}
      {step === "foods" && (
        <SelectFoods
          topicTitle={topicSelection?.title ?? ""}
          onContinueForward={handleFoodsContinue}
          loading={creating}
        />)}
      <VoiceGuideOverlay
        isConnecting={voice.isConnecting}
        error={voice.error}
        lastCaption={voice.lastCaption}
        lastUserTranscript={voice.lastUserTranscript}
        muted={voice.muted}
        onToggleMuted={() => voice.setMuted(!voice.muted)}
      />
    </>
  );
}
