import type { Topic } from "@shared/ModelTypes";
import { useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import SelectTopic from "./settings/SelectTopic";
import SelectFoods, { Food } from "./settings/SelectFoods";
import { createMeeting } from "@/api/createMeeting";
import { useRouting } from "@/routing";

export interface NewMeetingProps {
  setUnrecoverableError: (error: boolean) => void;
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
  const { i18n } = useTranslation();
  const { meetingPath } = useRouting();
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
      const { meetingId, liveKey } = await createMeeting({
        topic: topicSelection,
        characters: foods,
        language: i18n.language,
      });
      setMeetingliveKey(liveKey);
      navigate(meetingPath(Number(meetingId)));
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
        currentTopic={topicSelection ?? undefined}
        onContinueForward={handleTopicContinue}
      />
    );
  }

  return (
    <>
      <SelectFoods
        topicTitle={topicSelection?.title ?? ""}
        onContinueForward={handleFoodsContinue}
        loading={creating}
      />
    </>
  );
}
