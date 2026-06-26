import type { Topic } from "@shared/ModelTypes";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import VoiceGuideOverlay from "./VoiceGuideOverlay";
import { getTopicsBundle } from "@main/topicsBundle";
import { getCharacterSetupBundle } from "@newMeeting/CharacterSetup";
import type { Character } from "@shared/ModelTypes";
import {
  buildMeetingSetupSyncMessage,
  buildTopicFromSelection,
  type MeetingSetupPhase,
  type MeetingSetupUserEvent,
} from "@newMeeting/meetingSetup";
import { useMeetingSetupStore } from "@newMeeting/meetingSetupStore";
import { useButton, type ButtonLedMode } from "@/museum/button/useButton";
import { useCouncilSettings } from "@/settings/councilSettings";
import { buildGuidePrompt } from "./guidePrompt";
import { createGuideToolHandlers, createGuideTools } from "./guideTools";
import { getVoiceGuideBundle } from "./voiceGuideBundle";
import { useHoldToSpeakHint } from "./useHoldToSpeakHint";
import Loading from "@main/Loading";
import { useVoiceGuide } from "./useVoiceGuide";

type MeetingVoiceGuideProps = {
  phase: MeetingSetupPhase;
  lastUserEvent: MeetingSetupUserEvent | null;
  onBeginSetup: () => void;
  onGoToTopicStep: () => void;
  onSelectTopic: (topic: Topic) => void;
  onStartMeeting: (characters: Character[]) => Promise<void> | void;
};

export default function MeetingVoiceGuide({
  phase,
  lastUserEvent,
  onBeginSetup,
  onGoToTopicStep,
  onSelectTopic,
  onStartMeeting,
}: MeetingVoiceGuideProps) {
  const { i18n, t } = useTranslation();
  const { isMuseumMode, pushToTalkMode } = useCouncilSettings();
  const button = useButton("voice-guide");
  const {
    selectedTopic,
    customTopic,
    visitorName,
  } = useMeetingSetupStore();

  const topicsBundle = useMemo(() => getTopicsBundle(i18n.language), [i18n.language]);
  const characterSetupBundle = useMemo(() => getCharacterSetupBundle(i18n.language), [i18n.language]);
  const guideLanguage = i18n.language.toLowerCase().startsWith("sv") ? "sv" : "en";
  const promptBundle = useMemo(() => getVoiceGuideBundle(guideLanguage), [guideLanguage]);

  const guideTopics = useMemo(() => {
    return [
      ...topicsBundle.topics.map((topic: Topic) => ({
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

  const guideCharacters = useMemo(() => {
    return characterSetupBundle.characters.map((character: Character) => ({
      id: character.id,
      name: character.name,
      description: character.description,
    }));
  }, [characterSetupBundle]);

  const instructions = useMemo(() => {
    return buildGuidePrompt({
      bundle: promptBundle,
      topics: guideTopics,
      characters: guideCharacters,
      phase,
      pushToTalkMode,
      visitorName,
    });
  }, [guideCharacters, guideTopics, phase, promptBundle, pushToTalkMode, visitorName]);

  const voice = useVoiceGuide({
    language: guideLanguage,
    instructions,
    tools: createGuideTools({ promptBundle }),
    toolHandlers: createGuideToolHandlers({
      topics: guideTopics,
      characters: guideCharacters,
      beginSetup: onBeginSetup,
      goToTopicStep: onGoToTopicStep,
      buildSelectedTopic: () =>
        buildTopicFromSelection({
          topicsBundle,
          selectedTopicId: selectedTopic,
          customTopic,
        }),
      selectTopic: onSelectTopic,
      startMeeting: onStartMeeting,
      meetingStep: phase,
      voiceGuideLanguage: i18n.language,
      meetingCharactersLabels: {
        oneHuman: t("selectfoods.human"),
        twoHumansSuffix: t("selectfoods.twohumans"),
      },
    }),
    pushToTalkMode,
    micOpen: button.pressed,
  });
  const { sendUserMessage, muted } = voice;

  const showMuseumLandingLoading =
    isMuseumMode && phase === "landing" && !muted && voice.isConnecting;

  const { showHoldToSpeakHint } = useHoldToSpeakHint({
    pushToTalkMode,
    sessionActive: !muted,
    isConnecting: voice.isConnecting,
    micOpen: button.pressed,
    lastUserTranscript: voice.lastUserTranscript,
    lastCaption: voice.lastCaption,
  });

  const ledMode = useMemo((): ButtonLedMode => {
    if (!pushToTalkMode || muted || voice.isConnecting || voice.error) return "off";
    if (button.pressed) return "on";
    return "pulse";
  }, [pushToTalkMode, muted, voice.isConnecting, voice.error, button.pressed]);

  useEffect(() => {
    if (!pushToTalkMode) return;
    button.claim();
    return () => button.release();
  }, [button.claim, button.release, pushToTalkMode]);

  useEffect(() => {
    if (!pushToTalkMode) return;
    button.setLed(ledMode);
  }, [button.setLed, pushToTalkMode, ledMode]);

  useEffect(() => {
    if (!lastUserEvent) {
      return;
    }

    const timer = setTimeout(() => {
      sendUserMessage(buildMeetingSetupSyncMessage(lastUserEvent));
    }, 1000);

    return () => clearTimeout(timer);
  }, [lastUserEvent, sendUserMessage]);

  return (
    <>
      {showMuseumLandingLoading && <Loading />}
    <VoiceGuideOverlay
      isConnecting={voice.isConnecting}
      error={voice.error}
      lastCaption={voice.lastCaption}
      lastUserTranscript={voice.lastUserTranscript}
      muted={voice.muted}
      isMuseumMode={isMuseumMode}
      pushToTalkMode={pushToTalkMode}
      showHoldToSpeakHint={showHoldToSpeakHint}
      subtitleLayout={isMuseumMode ? "council" : "compact"}
      showPttVisualizer={pushToTalkMode}
      micStream={voice.micStream}
      micActive={pushToTalkMode && !muted && button.pressed}
      onStart={voice.start}
      onStop={voice.stop}
    />
    </>
  );
}
