import type { Character } from "@shared/ModelTypes";
import { useState } from "react";
import { useNavigate } from "react-router";
import SelectTopic, { Topic, TopicSelection } from "./settings/SelectTopic";
import SelectFoods, { Food } from "./settings/SelectFoods";
import { getTopicsBundle } from "@/components/topicsBundle";
import { createMeeting } from "@/api/createMeeting";
import { meetingPath } from "@/routing";

export interface NewMeetingProps {
  lang: string;
  setUnrecoverableError: (error: boolean) => void;
  topicSelection: TopicSelection | null;
  setTopicSelection: (selection: TopicSelection | null) => void;
}

export default function NewMeeting({
  lang,
  setUnrecoverableError,
  topicSelection,
  setTopicSelection,
}: NewMeetingProps) {
  const topicsBundle = getTopicsBundle(lang);
  const { topics, custom_topic: customTopicConfig, system: systemPrompt } = topicsBundle;

  const navigate = useNavigate();
  const [step, setStep] = useState<"topic" | "foods">("topic");
  const [creating, setCreating] = useState(false);

  const selectedForFoodsStep =
    topicSelection && resolveSelectedTopic(topics, customTopicConfig, topicSelection);
  const foodsStepTitle = selectedForFoodsStep?.title ?? "";

  function handleTopicContinue(data: TopicSelection) {
    const selected = resolveSelectedTopic(topics, customTopicConfig, data);
    if (!selected) return;
    setTopicSelection(data);
    setStep("foods");
  }

  async function handleFoodsContinue({ foods }: { foods: Food[] }) {
    if (!topicSelection) return;
    const baseTopic = resolveSelectedTopic(topics, customTopicConfig, topicSelection);
    if (!baseTopic) return;

    const topic = buildTopicDraftForMeeting(baseTopic, topicSelection, systemPrompt);
    const participants: Character[] = foods.map((food) => ({
      ...food,
      voice: food.voice,
      type: food.type || "food",
    })) as Character[];

    setCreating(true);
    try {
      const { meetingId } = await createMeeting({
        topic: topic.prompt || "",
        characters: participants,
        language: lang,
      });
      navigate(meetingPath(lang, meetingId));
    } catch (e) {
      console.error(e);
      setUnrecoverableError(true);
    } finally {
      setCreating(false);
    }
  }
  

  if (step === "topic") {
    return (
      <SelectTopic
        topics={topics}
        customTopicConfig={customTopicConfig}
        currentTopic={topicSelection ? resolveSelectedTopic(topics, customTopicConfig, topicSelection) ?? undefined : undefined}
        onContinueForward={handleTopicContinue}
      />
    );
  }

  return (
    <>
      <SelectFoods
        lang={lang}
        topicTitle={foodsStepTitle}
        onContinueForward={handleFoodsContinue}
        loading={creating}
      />
    </>
  );
}

function resolveSelectedTopic(
  topics: Topic[],
  customTopicConfig: Topic,
  selection: TopicSelection
): Topic | null {
  return (
    topics.find((t) => t.id === selection.topic) ??
    (selection.topic === customTopicConfig.id ? customTopicConfig : null) ??
    null
  );
}

function buildTopicDraftForMeeting(base: Topic, selection: TopicSelection, systemPrompt: string): Topic {
  const t = structuredClone(base);
  if (t.id === "customtopic") {
    t.prompt = selection.custom;
    t.description = selection.custom;
  }
  if (t.prompt) {
    t.prompt = systemPrompt.replace("[TOPIC]", t.prompt);
  }
  return t;
}
