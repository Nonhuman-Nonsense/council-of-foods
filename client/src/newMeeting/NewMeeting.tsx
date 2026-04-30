import type { Topic } from "@shared/ModelTypes";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import SelectTopic from "./SelectTopic";
import SelectCharacters from "./SelectCharacters";
import { createMeeting } from "@api/createMeeting";
import { useRouting } from "@/routing";
import MeetingVoiceGuide from "@voice/MeetingVoiceGuide";
import type { MeetingSetupUserEvent } from "./meetingSetup";
import type { MeetingCharacter } from "./CharacterSetup";
import { useMeetingSetupStore } from "@stores/useMeetingSetupStore";

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
  const [lastUserEvent, setLastUserEvent] = useState<MeetingSetupUserEvent | null>(null);

  // Setup state from store
  const {
    setSelectedTopic,
    setCustomTopic,
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

  function handleTopicPreview(topicId: string, topicTitle: string) {
    setLastUserEvent({
      type: "topic_previewed",
      topicId,
      topicTitle,
    });
  }

  function handleTopicCommitted(topic: Topic) {
    setLastUserEvent({
      type: "topic_committed",
      topicId: topic.id,
      topicTitle: topic.title,
    });
  }

  function handleTopicContinue(selectedTopic: Topic) {
    setTopicSelection(selectedTopic);
    setStep("foods");
  }

  function handleGoToTopicStep() {
    setStep("topic");
  }

  async function handleCharactersContinue({ characters }: { characters: MeetingCharacter[] }) {
    if (!topicSelection) {
      console.error("NewMeeting: missing topic when creating meeting");
      return;
    }
    setCreating(true);
    try {
      const { meetingId, liveKey } = await createMeeting({
        topic: topicSelection,
        characters,
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

  return (
    <>
      {step === "topic" && (
        <SelectTopic
          currentTopic={topicSelection ?? undefined}
          onPreviewTopic={handleTopicPreview}
          onCommitTopic={handleTopicCommitted}
          onContinueForward={handleTopicContinue}
        />
      )}
      {step === "foods" && (
        <SelectCharacters
          topicTitle={topicSelection?.title ?? ""}
          onContinueForward={handleCharactersContinue}
          loading={creating}
        />)}
      <MeetingVoiceGuide
        step={step}
        lastUserEvent={lastUserEvent}
        onGoToTopicStep={handleGoToTopicStep}
        onSelectTopic={handleTopicContinue}
        onStartMeeting={(characters: MeetingCharacter[]) => handleCharactersContinue({ characters })}
      />
    </>
  );
}
