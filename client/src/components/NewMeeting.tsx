import type { Topic } from "@shared/ModelTypes";
import { useState } from "react";
import { useNavigate } from "react-router";
import SelectTopic from "./settings/SelectTopic";
import SelectFoods, { Food } from "./settings/SelectFoods";
import { createMeeting } from "@/api/createMeeting";
import { meetingPath } from "@/routing";

export interface NewMeetingProps {
  lang: string;
  setUnrecoverableError: (error: boolean) => void;
  topicSelection: Topic | null;
  setTopicSelection: (topic: Topic) => void;
  setMeetingCreatorKey: (key: string) => void;
}

export default function NewMeeting({
  lang,
  setUnrecoverableError,
  topicSelection,
  setTopicSelection,
  setMeetingCreatorKey,
}: NewMeetingProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<"topic" | "foods">(() =>
    // If a topic has been selected, go to the foods step, eg. on reset
    topicSelection != null ? "foods" : "topic"
  );
  const [creating, setCreating] = useState(false);

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
      const { meetingId, creatorKey } = await createMeeting({
        topic: topicSelection,
        characters: foods,
        language: lang,
      });
      setMeetingCreatorKey(creatorKey);
      navigate(meetingPath(lang, Number(meetingId)));
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
        lang={lang}
        currentTopic={topicSelection ?? undefined}
        onContinueForward={handleTopicContinue}
      />
    );
  }

  return (
    <>
      <SelectFoods
        lang={lang}
        topicTitle={topicSelection?.title ?? ""}
        onContinueForward={handleFoodsContinue}
        loading={creating}
      />
    </>
  );
}
