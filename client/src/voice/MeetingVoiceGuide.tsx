import type { Topic } from "@shared/ModelTypes";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSwitchLanguage } from "@/routing";
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
import { useInactivityNudge } from "./useInactivityNudge";
import { useButtonBanner } from "@/museum/button/useButtonBanner";
import Loading from "@main/Loading";
import { useVoiceGuide } from "./useVoiceGuide";
import { useErrorStore } from "@main/overlay/errorStore";
import { useDocumentVisibility } from "@/utils";

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
  const { isMuseumMode, agentMode } = useCouncilSettings();
  const { switchLanguage, otherLanguages } = useSwitchLanguage();
  const button = useButton("voice-guide");
  const connectionError = useErrorStore((s) => s.connectionError);
  const {
    selectedTopic,
    customTopic,
    visitorName,
  } = useMeetingSetupStore();

  const topicsBundle = useMemo(() => getTopicsBundle(i18n.language), [i18n.language]);
  const characterSetupBundle = useMemo(() => getCharacterSetupBundle(i18n.language), [i18n.language]);
  const guideLanguage = i18n.language.toLowerCase().startsWith("sv") ? "sv" : "en";

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

  const LANGUAGE_DISPLAY_NAMES: Record<string, string> = { en: "English", sv: "Swedish" };
  const otherLanguageNames = useMemo(
    () => otherLanguages.map((lang) => LANGUAGE_DISPLAY_NAMES[lang] ?? lang),
    [otherLanguages],
  );

  const instructions = useMemo(() => {
    return buildGuidePrompt({
      language: guideLanguage,
      topics: guideTopics,
      characters: guideCharacters,
      phase,
      agentMode,
      visitorName,
      otherLanguageNames,
    });
  }, [guideCharacters, guideTopics, phase, guideLanguage, agentMode, visitorName, otherLanguageNames]);

  const voice = useVoiceGuide({
    language: guideLanguage,
    instructions,
    isMuseumMode,
    tools: createGuideTools({ otherLanguages, topics: guideTopics, characters: guideCharacters, agentMode, isWebMode: !isMuseumMode }),
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
        formatHumanCount: (count) => t("meeting.characters.humanCount", { count }),
      },
      otherLanguages,
      switchLanguage,
    }),
    agentMode,
    micOpen: button.pressed,
  });
  const { sendUserMessage, muted } = voice;
  const isDocumentVisible = useDocumentVisibility();

  const [nudgeFired, setNudgeFired] = useState(false);

  // Stop nudging while the tab is hidden.
  useInactivityNudge({
    agentSpeaking: voice.agentSpeaking,
    lastUserTranscript: voice.lastUserTranscript,
    sendMessage: sendUserMessage,
    requestResponse: voice.requestAgentResponse,
    delayMs: 10_000,
    enabled: !voice.isConnecting && !muted && isDocumentVisible,
    onNudgeFired: () => setNudgeFired(true),
    message:
      phase === "landing"
        ? "The visitor is quiet. Gently prompt them to respond to you."
        : "The visitor has been quiet for a while. Check in with them — ask if they need help or have a question.",
  });

  // Shared flag: set whenever we tear down the session due to the user being away
  // (tab hidden for 60s, or no speech for 3 min). Cleared on resume.
  const stoppedByBackgroundRef = useRef(false);

  // Handle tab visibility changes:
  // - Hidden: start a grace timer; if still hidden after 60s, tear down the session.
  // - Visible again after teardown: auto-resume (opening greeting plays automatically).
  // - Visible again within grace period: send an immediate refocus message.
  const HIDDEN_GRACE_MS = 60_000;
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) { hasMountedRef.current = true; return; }

    if (!isDocumentVisible) {
      const id = setTimeout(() => {
        stoppedByBackgroundRef.current = true;
        voice.stop();
      }, HIDDEN_GRACE_MS);
      return () => clearTimeout(id);
    }

    if (stoppedByBackgroundRef.current) {
      stoppedByBackgroundRef.current = false;
      void voice.start();
    } else if (!muted && !voice.isConnecting && !voice.agentSpeaking) {
      sendUserMessage(
        phase === "landing"
          ? "The visitor has returned after a brief absence. Welcome them back and invite them to continue."
          : "The visitor has returned after a brief absence. Check in warmly and help them pick up where they left off.",
      );
      voice.requestAgentResponse();
      setNudgeFired(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDocumentVisible]);

  // Absolute idle timer: if no user speech for 3 minutes, tear down the session.
  // Covers the case where the tab stays visible but the user has switched to another app.
  const IDLE_TIMEOUT_MS = 3 * 60_000;
  useEffect(() => {
    if (muted) return;
    const id = setTimeout(() => {
      stoppedByBackgroundRef.current = true;
      voice.stop();
    }, IDLE_TIMEOUT_MS);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voice.lastUserTranscript, muted]);

  // Resume on window focus if the session was torn down by the background timer.
  // This handles returning from another app without switching tabs.
  useEffect(() => {
    function onWindowFocus() {
      if (!stoppedByBackgroundRef.current) return;
      stoppedByBackgroundRef.current = false;
      void voice.start();
    }
    window.addEventListener("focus", onWindowFocus);
    return () => window.removeEventListener("focus", onWindowFocus);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showMuseumReconnecting =
    isMuseumMode && !muted && voice.isConnecting && !connectionError;

  const { bumpBannerActivity } = useButtonBanner({
    owner: "voice-guide",
    sessionActive: agentMode === "ptt" && !muted,
    isConnecting: voice.isConnecting,
    micOpen: button.pressed,
    agentSpeaking: voice.agentSpeaking && !nudgeFired,
  });

  // Falling-edge only: bump the idle clock when the agent finishes speaking so
  // the 10s countdown starts from that moment. Rising edge is suppressed by
  // agentSpeaking prop above so the banner can't show while the agent talks.
  // Nudge guard: skip the bump during a nudge response so the banner stays visible.
  useEffect(() => {
    if (voice.agentSpeaking || nudgeFired) return;
    bumpBannerActivity();
  }, [voice.agentSpeaking, nudgeFired, bumpBannerActivity]);

  // Real user input clears the nudge override and bumps the idle clock.
  useEffect(() => {
    if (!voice.lastUserTranscript) return;
    setNudgeFired(false);
    bumpBannerActivity();
  }, [voice.lastUserTranscript, bumpBannerActivity]);

  useEffect(() => {
    if (!button.pressed) return;
    setNudgeFired(false);
    bumpBannerActivity();
  }, [button.pressed, bumpBannerActivity]);

  const ledMode = useMemo((): ButtonLedMode => {
    if (agentMode !== "ptt" || muted || voice.isConnecting) return "off";
    if (button.pressed) return "on";
    return "pulse";
  }, [agentMode, muted, voice.isConnecting, button.pressed]);

  useEffect(() => {
    if (agentMode !== "ptt") return;
    button.claim();
    return () => button.release();
  }, [button.claim, button.release, agentMode]);

  useEffect(() => {
    if (agentMode !== "ptt") return;
    button.setLed(ledMode);
  }, [button.setLed, agentMode, ledMode]);

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
      {showMuseumReconnecting && <Loading />}
    <VoiceGuideOverlay
      isConnecting={voice.isConnecting}
      lastCaption={voice.lastCaption}
      lastUserTranscript={voice.lastUserTranscript}
      muted={voice.muted}
      isMuseumMode={isMuseumMode}
      agentMode={agentMode}
      subtitleLayout={isMuseumMode ? "council" : "compact"}
      micStream={voice.micStream}
      micActive={agentMode === "ptt" && !muted && button.pressed}
      onStart={voice.start}
      onStop={voice.stop}
    />
    </>
  );
}
