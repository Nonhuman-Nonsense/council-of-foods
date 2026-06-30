import type { Character, Topic } from "@shared/ModelTypes";
import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { createMeeting } from "@api/createMeeting";
import { isRootPath, useRouting } from "@/routing";
import MeetingVoiceGuide from "@voice/MeetingVoiceGuide";
import { useCouncilSettings } from "@/settings/councilSettings";
import type { MeetingSetupPhase, MeetingSetupUserEvent } from "./meetingSetup";
import { useMeetingSetupStore } from "@newMeeting/meetingSetupStore";
import type { SetUnrecoverableError } from "@main/overlay/CouncilError";
import type { SetConnectionError } from "@main/overlay/Reconnecting";

export interface MeetingSetupShellProps {
  setUnrecoverableError: SetUnrecoverableError;
  setConnectionError: SetConnectionError;
  topicSelection: Topic | null;
  setTopicSelection: (topic: Topic) => void;
  setMeetingliveKey: (key: string) => void;
}

export type MeetingSetupOutletContext = {
  step: "topic" | "characters";
  setStep: (step: "topic" | "characters") => void;
  setLastUserEvent: (event: MeetingSetupUserEvent | null) => void;
  topicSelection: Topic | null;
  setTopicSelection: (topic: Topic) => void;
  creating: boolean;
  onStartMeeting: (characters: Character[]) => Promise<void>;
};

export default function MeetingSetupShell({
  setUnrecoverableError,
  setConnectionError,
  topicSelection,
  setTopicSelection,
  setMeetingliveKey,
}: MeetingSetupShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { i18n, t } = useTranslation();
  const { newMeetingPath, meetingPath } = useRouting();
  const { agentMode } = useCouncilSettings();

  const [step, setStep] = useState<"topic" | "characters">(() =>
    topicSelection != null ? "characters" : "topic"
  );
  const [lastUserEvent, setLastUserEvent] = useState<MeetingSetupUserEvent | null>(null);
  const [creating, setCreating] = useState(false);

  const phase: MeetingSetupPhase = isRootPath(location.pathname) ? "landing" : step;

  const { setSelectedTopic, setCustomTopic, visitorName } = useMeetingSetupStore();

  useEffect(() => {
    if (isRootPath(location.pathname)) {
      setStep("topic");
      setLastUserEvent(null);
      useMeetingSetupStore.getState().resetStore();
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!topicSelection || isRootPath(location.pathname)) {
      return;
    }
    setStep("characters");
    setSelectedTopic(topicSelection.id);
    if (topicSelection.id === "customtopic") {
      setCustomTopic(topicSelection.description ?? "");
    } else {
      setCustomTopic("");
    }
  }, [topicSelection?.id, topicSelection?.description, location.pathname, setSelectedTopic, setCustomTopic]);

  function beginSetup() {
    if (isRootPath(location.pathname)) {
      navigate(newMeetingPath);
    }
    setStep("topic");
  }

  function handleGoToTopicStep() {
    if (isRootPath(location.pathname)) {
      navigate(newMeetingPath);
    }
    setStep("topic");
  }

  function handleSelectTopic(topic: Topic) {
    setTopicSelection(topic);
    if (isRootPath(location.pathname)) {
      navigate(newMeetingPath);
    }
    setStep("characters");
  }

  async function handleStartMeeting(characters: Character[]) {
    if (!topicSelection) {
      console.error("MeetingSetupShell: missing topic when creating meeting");
      return;
    }
    setCreating(true);
    try {
      const { meetingId, liveKey } = await createMeeting({
        topic: topicSelection,
        characters,
        language: i18n.language,
        ...(visitorName.trim() ? { humanName: visitorName.trim() } : {}),
      });
      setMeetingliveKey(liveKey);
      navigate(meetingPath(Number(meetingId)));
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error && e.message.trim().length > 0 ? e.message : t("error.message");
      setUnrecoverableError({
        message: msg,
        source: "MeetingSetupShell.createMeeting",
        cause: e,
      });
    } finally {
      setCreating(false);
    }
  }

  const outletContext: MeetingSetupOutletContext = {
    step,
    setStep,
    setLastUserEvent,
    topicSelection,
    setTopicSelection,
    creating,
    onStartMeeting: handleStartMeeting,
  };

  return (
    <>
      <Outlet context={outletContext} />
      {agentMode !== "off" ? (
        <MeetingVoiceGuide
          phase={phase}
          lastUserEvent={lastUserEvent}
          onBeginSetup={beginSetup}
          onGoToTopicStep={handleGoToTopicStep}
          onSelectTopic={handleSelectTopic}
          onStartMeeting={handleStartMeeting}
          setUnrecoverableError={setUnrecoverableError}
          setConnectionError={setConnectionError}
        />
      ) : null}
    </>
  );
}
