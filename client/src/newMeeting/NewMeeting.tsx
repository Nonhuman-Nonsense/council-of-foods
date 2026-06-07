import type { Topic } from "@shared/ModelTypes";
import { useEffect } from "react";
import { useOutletContext } from "react-router";
import SelectTopic from "./SelectTopic";
import SelectCharacters from "./SelectCharacters";
import type { MeetingSetupOutletContext } from "./MeetingSetupShell";
import { useMeetingSetupStore } from "@stores/useMeetingSetupStore";

export default function NewMeeting() {
  const {
    step,
    setStep,
    setLastUserEvent,
    topicSelection,
    setTopicSelection,
    creating,
    onStartMeeting,
  } = useOutletContext<MeetingSetupOutletContext>();

  const { setSelectedTopic, setCustomTopic } = useMeetingSetupStore();

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
          onContinueForward={({ characters }) => onStartMeeting(characters)}
          loading={creating}
        />
      )}
    </>
  );
}
