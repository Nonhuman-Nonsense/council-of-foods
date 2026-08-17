import type { Topic } from "@shared/ModelTypes";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useSwitchLanguage } from "@/navigation";
import { useTranslation } from "react-i18next";
import SetupAgentOverlay from "./SetupAgentOverlay";
import { getTopicsBundle } from "@main/topicsBundle";
import { getCharacterSetupBundle } from "@newMeeting/CharacterSetup";
import type { Character } from "@shared/ModelTypes";
import {
  buildMeetingSetupReactionMessage,
  buildTopicFromSelection,
  diffCouncil,
  getMeetingSetupReactionDelayMs,
  selectedFoodNames,
  type MeetingSetupPhase,
  type MeetingSetupUserEvent,
} from "@newMeeting/meetingSetup";
import { useMeetingSetupStore } from "@newMeeting/meetingSetupStore";
import { useButton } from "@/museum/button/useButton";
import { useCouncilSettings } from "@/settings/councilSettings";
import { buildSetupAgentPrompt } from "./setupAgentPrompt";
import { createSetupAgentToolHandlers, createSetupAgentTools } from "./setupAgentTools";
import { useAgentPresence } from "./useAgentPresence";
import { useButtonBanner } from "@/museum/button/useButtonBanner";
import Loading from "@main/Loading";
import { useSetupAgent, type SetupAgentContext } from "./useSetupAgent";
import { useErrorStore } from "@main/overlay/errorStore";

type MeetingSetupAgentProps = {
  phase: MeetingSetupPhase;
  lastUserEvent: MeetingSetupUserEvent | null;
  onBeginSetup: () => void;
  onGoToTopicStep: () => void;
  onSelectTopic: (topic: Topic) => void;
  onStartMeeting: (characters: Character[]) => Promise<void> | void;
};

export default function MeetingSetupAgent({
  phase,
  lastUserEvent,
  onBeginSetup,
  onGoToTopicStep,
  onSelectTopic,
  onStartMeeting,
}: MeetingSetupAgentProps) {
  const { i18n, t } = useTranslation();
  const { isMuseumMode, capabilities } = useCouncilSettings();
  const { switchLanguage, otherLanguages } = useSwitchLanguage();
  const button = useButton("setup-agent");
  const connectionError = useErrorStore((s) => s.connectionError);
  const {
    selectedTopic,
    customTopic,
    visitorName,
  } = useMeetingSetupStore();

  const topicsBundle = useMemo(() => getTopicsBundle(i18n.language), [i18n.language]);
  const characterSetupBundle = useMemo(() => getCharacterSetupBundle(i18n.language), [i18n.language]);
  const agentLanguage = i18n.language.toLowerCase().startsWith("sv") ? "sv" : "en";

  const setupTopics = useMemo(() => {
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

  const setupCharacters = useMemo(() => {
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

  // A builder, not a value: the agent's job changes once the visitor has been
  // audible, and that latch lives inside useSetupAgent.
  const instructions = useCallback(
    ({ hasEverHeardVisitor }: SetupAgentContext) =>
      buildSetupAgentPrompt({
        language: agentLanguage,
        topics: setupTopics,
        characters: setupCharacters,
        phase,
        visitorName,
        otherLanguageNames,
        hasEverHeardVisitor,
      }),
    [setupCharacters, setupTopics, phase, agentLanguage, visitorName, otherLanguageNames],
  );

  // Static: the agent holds every tool from the start, and useSetupAgent
  // refuses the ones it should not use yet.
  const tools = useMemo(
    () =>
      createSetupAgentTools({
        otherLanguages,
        topics: setupTopics,
        characters: setupCharacters,
        isWebMode: !isMuseumMode,
      }),
    [otherLanguages, setupTopics, setupCharacters, isMuseumMode],
  );

  const agent = useSetupAgent({
    language: agentLanguage,
    instructions,
    unattended: capabilities.unattended,
    tools,
    toolHandlers: createSetupAgentToolHandlers({
      topics: setupTopics,
      characters: setupCharacters,
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
      setupAgentLanguage: i18n.language,
      meetingCharactersLabels: {
        formatHumanCount: (count) => t("meeting.characters.humanCount", { count }),
      },
      otherLanguages,
      switchLanguage,
    }),
    micUpFront: capabilities.micUpFront,
    micOpen: button.wantsMic,
  });
  const { interruptAndRespond, muted } = agent;
  // Any click or keystroke counts as activity — resets the idle nudge and the
  // absolute idle teardown, so the agent doesn't ask "are you there?" (or tear
  // the session down) while the visitor is mid-sentence typing a description.
  const { nudgeFired, clearNudge } = useAgentPresence({ agent, phase, lastActivity: lastUserEvent });

  /**
   * The council as the agent was last told it. Reactions are debounced, so one
   * message can cover several clicks; diffing against this names everything
   * that changed rather than only the last click. Advanced only when a message
   * is actually sent — a reaction cancelled by a newer click must not move it.
   */
  const reportedCouncilRef = useRef<string[]>([]);

  // Re-baseline on entering the food step: the visitor may arrive with foods
  // already chosen (returning from the topic step), or with a store that was
  // reset back at the landing page. Character reactions only happen here, so
  // this is the only moment the baseline can go stale unnoticed.
  useEffect(() => {
    if (phase !== "characters") return;
    reportedCouncilRef.current = selectedFoodNames(
      useMeetingSetupStore.getState().selectedCharacters,
      setupCharacters,
    );
  }, [phase, setupCharacters]);

  const showBlockingReconnect =
    capabilities.unattended && !muted && agent.isConnecting && !connectionError;

  const { bumpBannerActivity } = useButtonBanner({
    owner: "setup-agent",
    sessionActive: isMuseumMode && !muted,
    isConnecting: agent.isConnecting,
    micOpen: button.wantsMic,
    agentSpeaking: agent.agentSpeaking && !nudgeFired,
  });

  // Falling-edge only: bump the idle clock when the agent finishes speaking so
  // the 10s countdown starts from that moment. Rising edge is suppressed by
  // agentSpeaking prop above so the banner can't show while the agent talks.
  // Nudge guard: skip the bump during a nudge response so the banner stays visible.
  useEffect(() => {
    if (agent.agentSpeaking || nudgeFired) return;
    bumpBannerActivity();
  }, [agent.agentSpeaking, nudgeFired, bumpBannerActivity]);

  // Real user input bumps the idle clock (nudge override is cleared by useAgentPresence).
  useEffect(() => {
    if (!agent.lastUserTranscript) return;
    bumpBannerActivity();
  }, [agent.lastUserTranscript, bumpBannerActivity]);

  useEffect(() => {
    if (!button.pressed) return;
    clearNudge();
    bumpBannerActivity();
  }, [button.pressed, clearNudge, bumpBannerActivity]);

  // Armed in both modes now — arming is what makes `pressed`/`wantsMic` live
  // at all, and space is the web mic gesture from here on. An agent that is
  // off or still connecting cannot take a voice, so it disarms.
  const canTakeVoice = !muted && !agent.isConnecting;

  useEffect(() => {
    button.claim();
    return () => button.release();
  }, [button.claim, button.release]);

  useEffect(() => {
    button.setArmed(canTakeVoice);
  }, [button.setArmed, canTakeVoice]);

  /**
   * The on-screen mic button is the same gesture as a tap, by another input
   * device — so it toggles the same latch rather than keeping its own state.
   * Wanting to talk implies wanting to hear the reply, so it also brings the
   * agent back if it was switched off, or starts it for the first time on a
   * page still waiting for a gesture. The latch survives the arming that
   * follows, so setting it here while still disarmed is safe.
   */
  const handleToggleMic = useCallback(() => {
    if (muted) void agent.start();
    button.toggleLatch();
  }, [muted, agent.start, button.toggleLatch]);

  useEffect(() => {
    if (!lastUserEvent) {
      return;
    }

    const timer = setTimeout(() => {
      // Only roster-carrying events can be diffed — checking for the field
      // itself keeps this correct as new event kinds are added.
      const hasRoster = "selectedNames" in lastUserEvent;
      const changes = hasRoster
        ? diffCouncil(reportedCouncilRef.current, lastUserEvent.selectedNames)
        : undefined;

      const message = buildMeetingSetupReactionMessage(lastUserEvent, changes);
      // Empty when the window nets out to no change — say nothing rather than
      // interrupt the agent for it.
      if (message === "") return;

      // Barge-in: cut off whatever the agent is currently saying (if
      // anything) and react to this click immediately, mirroring server-VAD
      // voice interruption rather than queuing behind current audio.
      interruptAndRespond(message, "click-reaction");

      if (hasRoster) {
        reportedCouncilRef.current = lastUserEvent.selectedNames;
      }
    }, getMeetingSetupReactionDelayMs(lastUserEvent));

    return () => clearTimeout(timer);
  }, [lastUserEvent, interruptAndRespond]);

  return (
    <>
      {showBlockingReconnect && <Loading />}
    <SetupAgentOverlay
      isConnecting={agent.isConnecting}
      isStarting={agent.isStarting}
      isReady={agent.isReady}
      lastCaption={agent.lastCaption}
      lastUserTranscript={agent.lastUserTranscript}
      muted={agent.muted}
      browserUi={capabilities.browserUi}
      showMicRow={isMuseumMode}
      subtitleLayout={isMuseumMode ? "council" : "compact"}
      micStream={agent.micStream}
      micActive={!muted && button.wantsMic}
      micOn={!muted && button.wantsMic}
      onToggleMic={handleToggleMic}
      onStart={agent.start}
      onStop={agent.stop}
    />
    </>
  );
}
