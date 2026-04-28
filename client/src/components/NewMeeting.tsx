import type { Topic } from "@shared/ModelTypes";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import SelectTopic from "./settings/SelectTopic";
import SelectFoods, { createDefaultHumans, getFoodsBundle, Food } from "./settings/SelectFoods";
import { createMeeting } from "@/api/createMeeting";
import { useRouting } from "@/routing";
import { globalClientOptions } from "@/globalClientOptions";
import VoiceGuideOverlay from "@/components/VoiceGuideOverlay";
import { buildGuidePrompt } from "@/voice/guidePrompt";
import { useVoiceGuide } from "@/voice/useVoiceGuide";
import { getTopicsBundle } from "@/components/topicsBundle";
import voiceGuidePromptEn from "@shared/prompts/voice_guide_en.json";
import { createGuideToolHandlers, createGuideTools } from "@/voice/guideTools";

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

  // Lifted setup state (single source of truth for both clicks and voiceguide tools)
  const [selectedTopic, setSelectedTopic] = useState<string>("");
  const [customTopic, setCustomTopic] = useState<string>("");

  const [selectedFoods, setSelectedFoods] = useState<string[]>([globalClientOptions.chairId]);
  const [humans, setHumans] = useState<Food[]>(() => createDefaultHumans());
  const [numberOfHumans, setNumberOfHumans] = useState<number>(0);

  // Keep lifted topic UI state consistent if we start on foods step (e.g. reset flow)
  useEffect(() => {
    if (!topicSelection) return;
    setSelectedTopic(topicSelection.id);
    if (topicSelection.id === "customtopic") {
      setCustomTopic(topicSelection.description ?? "");
    } else {
      setCustomTopic("");
    }
  }, [topicSelection?.id, topicSelection?.description]);

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
      selectedTopic,
      setSelectedTopic,
      customTopic,
      setCustomTopic,
      selectedFoods,
      setSelectedFoods,
      humans,
      setHumans,
      numberOfHumans,
      setNumberOfHumans,
      buildSelectedTopicFromUi,
      confirmTopic: (topic: Topic) => handleTopicContinue(topic),
      startMeeting: async (_foods: Food[]) => {
        // TODO: wire to the same path as clicking Continue in SelectFoods (Phase 4/5).
        return;
      },
    }),
  });

  // Auto-start + cleanup are owned by useVoiceGuide() itself, which is
  // StrictMode-safe (in-flight start is aborted on unmount).

  if (step === "topic") {
    return (
      <>
        <SelectTopic
          currentTopic={topicSelection ?? undefined}
          selectedTopic={selectedTopic}
          setSelectedTopic={setSelectedTopic}
          customTopic={customTopic}
          setCustomTopic={setCustomTopic}
          onContinueForward={handleTopicContinue}
        />
        <VoiceGuideOverlay
          status={voice.status}
          error={voice.error}
          lastCaption={voice.lastCaption}
          lastUserTranscript={voice.lastUserTranscript}
          onStart={() => void voice.start()}
          onStop={voice.stop}
        />
      </>
    );
  }

  return (
    <>
      <SelectFoods
        topicTitle={topicSelection?.title ?? ""}
        onContinueForward={handleFoodsContinue}
        loading={creating}
        selectedFoods={selectedFoods}
        setSelectedFoods={setSelectedFoods}
        humans={humans}
        setHumans={setHumans}
        numberOfHumans={numberOfHumans}
        setNumberOfHumans={setNumberOfHumans}
      />
      <VoiceGuideOverlay
        status={voice.status}
        error={voice.error}
        lastCaption={voice.lastCaption}
        lastUserTranscript={voice.lastUserTranscript}
        onStart={() => void voice.start()}
        onStop={voice.stop}
      />
    </>
  );
}
