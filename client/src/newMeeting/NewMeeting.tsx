import type { Topic } from "@shared/ModelTypes";
import type { CouncilRoster, HumanDetails } from "./meetingSetup";
import { useEffect } from "react";
import { useOutletContext } from "react-router";
import SelectTopic from "./SelectTopic";
import SelectCharacters from "./SelectCharacters";
import type { MeetingSetupOutletContext } from "./MeetingSetupShell";
import { useMeetingSetupStore } from "@newMeeting/meetingSetupStore";

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

  function handleCharacterSelected(selectedNames: string[], chairName: string, isFull: boolean) {
    setLastUserEvent({ type: "character_selected", selectedNames, chairName, isFull });
  }

  function handleCharacterDeselected(selectedNames: string[], chairName: string, isFull: boolean) {
    setLastUserEvent({ type: "character_deselected", selectedNames, chairName, isFull });
  }

  function handleCharactersRandomized(selectedNames: string[], chairName: string, isFull: boolean) {
    setLastUserEvent({
      type: "characters_randomized",
      selectedNames,
      chairName,
      isFull,
    });
  }

  function handleHumanSelected(details: HumanDetails & CouncilRoster) {
    setLastUserEvent({ type: "human_selected", ...details });
  }

  function handleHumanDetailsTyped(details: HumanDetails & CouncilRoster) {
    setLastUserEvent({ type: "human_details_typed", ...details });
  }

  function handleHumanDetailsConfirmed(details: HumanDetails & CouncilRoster) {
    setLastUserEvent({ type: "human_details_confirmed", ...details });
  }

  function handleHumanDeselected(deselectedName: string, roster: CouncilRoster) {
    setLastUserEvent({ type: "human_deselected", deselectedName, ...roster });
  }

  function handleTopicContinue(selectedTopic: Topic) {
    setTopicSelection(selectedTopic);
    setStep("characters");
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
      {step === "characters" && (
        <SelectCharacters
          topicTitle={topicSelection?.title ?? ""}
          agendaPoints={topicSelection?.agendaPoints}
          onContinueForward={({ characters }) => onStartMeeting(characters)}
          loading={creating}
          onCharacterSelected={handleCharacterSelected}
          onCharacterDeselected={handleCharacterDeselected}
          onCharactersRandomized={handleCharactersRandomized}
          onHumanSelected={handleHumanSelected}
          onHumanDetailsTyped={handleHumanDetailsTyped}
          onHumanDetailsConfirmed={handleHumanDetailsConfirmed}
          onHumanDeselected={handleHumanDeselected}
        />
      )}
    </>
  );
}
