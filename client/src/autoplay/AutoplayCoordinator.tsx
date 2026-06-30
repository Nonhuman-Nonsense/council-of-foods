import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import Overlay from "@main/overlay/Overlay";
import AutoplayWarning from "@main/overlay/AutoplayWarning";
import { fetchAutoplayMeetingId } from "@api/fetchAutoplayMeeting";
import { useButton } from "@/museum/button/useButton";
import { useButtonStore } from "@/museum/button/buttonStore";
import { useCouncilSettings } from "@/settings/councilSettings";
import { useMeetingSetupStore } from "@newMeeting/meetingSetupStore";
import { isRootPath, stripLanguagePrefix, useRouting } from "@/routing";
import routes from "@/routes.json";
import {
  AUTOPLAY_NEXT_MEETING_MS,
  bumpAutoplayActivity,
  useAutoplayStore,
} from "./autoplayStore";
import { log } from "@/logger";

const LANDING_SETUP_IDLE_MS = 90_000;
const IDLE_POLL_MS = 1_000;
const FETCH_RETRY_MS = 5_000;

export interface AutoplayCoordinatorProps {
  meetingliveKey: string | null;
  setMeetingliveKey: (key: string | null) => void;
}

type IdleInactiveReason =
  | "not_museum"
  | "phase_not_off"
  | "setup_hash"
  | "setup_button_claim"
  | "live_meeting_playing"
  | "no_idle_context";

export default function AutoplayCoordinator({
  meetingliveKey,
  setMeetingliveKey,
}: AutoplayCoordinatorProps): React.ReactElement | null {
  const { isMuseumMode } = useCouncilSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const { rootPath, meetingPath } = useRouting();
  const button = useButton("autoplay");

  const phase = useAutoplayStore((state) => state.phase);
  const councilOnSummary = useAutoplayStore((state) => state.councilOnSummary);
  const summaryFinishedTick = useAutoplayStore((state) => state.summaryFinishedTick);
  const summaryFinishedTickAtEntry = useAutoplayStore((state) => state.summaryFinishedTickAtEntry);
  const setPhase = useAutoplayStore((state) => state.setPhase);

  const enterInFlightRef = useRef(false);
  const prevPressedRef = useRef(false);
  const lastIdleInactiveReasonRef = useRef<IdleInactiveReason | "watching" | null>(null);
  const setupClaimed = useButtonStore((state) => state.claims.setup === true);

  const logIdleInactive = useCallback((reason: IdleInactiveReason, extra?: Record<string, unknown>) => {
    if (lastIdleInactiveReasonRef.current === reason) {
      return;
    }
    lastIdleInactiveReasonRef.current = reason;
    log.event("AUTOPLAY", "idle watch inactive", { reason, ...extra });
  }, []);

  useEffect(() => {
    if (!isMuseumMode) {
      log.event("AUTOPLAY", "coordinator inactive", { reason: "not_museum_mode" });
      return;
    }
    log.event("AUTOPLAY", "coordinator active", {
      phase,
      pathname: location.pathname,
      thresholdMs: LANDING_SETUP_IDLE_MS,
    });
  }, [isMuseumMode]);

  const enterAutoplay = useCallback(async () => {
    if (enterInFlightRef.current) {
      log.event("AUTOPLAY", "enter skipped", { reason: "already_in_flight" });
      return;
    }
    enterInFlightRef.current = true;
    log.event("AUTOPLAY", "enter started");
    setPhase("active");
    setMeetingliveKey(null);
    bumpAutoplayActivity("enter-autoplay");

    const language = i18n.language.toLowerCase().startsWith("sv") ? "sv" : "en";

    try {
      const meetingId = await fetchAutoplayMeetingId(language);
      navigate(meetingPath(meetingId), { replace: true });
      log.event("AUTOPLAY", "enter navigated", { meetingId, language });
    } catch (error) {
      log.event("ERROR", "autoplay enter failed", error);
      setPhase("off");
      window.setTimeout(() => {
        enterInFlightRef.current = false;
      }, FETCH_RETRY_MS);
      return;
    }

    enterInFlightRef.current = false;
  }, [i18n.language, meetingPath, navigate, setMeetingliveKey, setPhase]);

  const dismissWarning = useCallback(() => {
    log.event("AUTOPLAY", "warning dismissed", { via: "hardware_button" });
    setPhase("off");
    bumpAutoplayActivity("warning-dismissed");
  }, [setPhase]);

  const exitAutoplay = useCallback(() => {
    log.event("AUTOPLAY", "exit to landing", { via: "hardware_button" });
    setPhase("off");
    useMeetingSetupStore.getState().resetStore();
    window.location.href = rootPath;
  }, [rootPath, setPhase]);

  const showWarning = useCallback(() => {
    if (useAutoplayStore.getState().phase !== "off") {
      return;
    }
    log.event("AUTOPLAY", "warning shown");
    bumpAutoplayActivity("warning-shown");
    setPhase("warning");
  }, [setPhase]);

  useEffect(() => {
    if (!isMuseumMode) {
      return;
    }
    bumpAutoplayActivity("pathname");
  }, [isMuseumMode, location.pathname]);

  useEffect(() => {
    if (!isMuseumMode) {
      return;
    }
    return useButtonStore.subscribe((state, prevState) => {
      if (state.pressed && !prevState.pressed) {
        bumpAutoplayActivity("button-press");
      }
    });
  }, [isMuseumMode]);

  useEffect(() => {
    if (!isMuseumMode || phase === "off") {
      return;
    }

    button.claim();
    button.setLed("pulse");

    return () => {
      button.release();
    };
  }, [phase, button.claim, button.release, button.setLed, isMuseumMode]);

  useEffect(() => {
    if (!isMuseumMode) {
      return;
    }

    const pressed = button.pressed;
    const wasPressed = prevPressedRef.current;
    prevPressedRef.current = pressed;

    if (!pressed || wasPressed) {
      return;
    }

    if (phase === "warning") {
      dismissWarning();
      return;
    }

    if (phase === "active") {
      exitAutoplay();
    }
  }, [phase, button.pressed, dismissWarning, exitAutoplay, isMuseumMode]);

  useEffect(() => {
    if (!isMuseumMode || phase !== "active") {
      return;
    }
    if (!councilOnSummary) {
      return;
    }
    if (summaryFinishedTick <= summaryFinishedTickAtEntry) {
      return;
    }

    log.event("AUTOPLAY", "summary reading done — next meeting scheduled", {
      delayMs: AUTOPLAY_NEXT_MEETING_MS,
    });

    const timerId = window.setTimeout(() => {
      void (async () => {
        const language = i18n.language.toLowerCase().startsWith("sv") ? "sv" : "en";
        try {
          const meetingId = await fetchAutoplayMeetingId(language);
          bumpAutoplayActivity("loop-next-meeting");
          navigate(meetingPath(meetingId), { replace: true });
          log.event("AUTOPLAY", "loop navigated", { meetingId, language });
        } catch (error) {
          log.event("ERROR", "autoplay loop failed", error);
          bumpAutoplayActivity("loop-retry");
        }
      })();
    }, AUTOPLAY_NEXT_MEETING_MS);

    return () => window.clearTimeout(timerId);
  }, [
    councilOnSummary,
    i18n.language,
    isMuseumMode,
    meetingPath,
    navigate,
    phase,
    summaryFinishedTick,
    summaryFinishedTickAtEntry,
  ]);

  useEffect(() => {
    if (!isMuseumMode) {
      logIdleInactive("not_museum");
      return;
    }
    if (phase !== "off") {
      logIdleInactive("phase_not_off", { phase });
      return;
    }

    const withoutLang = stripLanguagePrefix(location.pathname);
    const onSetupRoute = withoutLang === `/${routes.newMeeting}`;
    const onLanding = isRootPath(location.pathname);
    const liveMeetingPlaying = Boolean(meetingliveKey) && !councilOnSummary;

    if (location.hash === "#setup") {
      logIdleInactive("setup_hash");
      return;
    }
    if (setupClaimed) {
      logIdleInactive("setup_button_claim");
      return;
    }
    if (liveMeetingPlaying) {
      logIdleInactive("live_meeting_playing");
      return;
    }

    const idleContext = onLanding || onSetupRoute ? "setup" : null;

    if (!idleContext) {
      logIdleInactive("no_idle_context", { pathname: location.pathname });
      return;
    }

    if (lastIdleInactiveReasonRef.current !== "watching") {
      lastIdleInactiveReasonRef.current = "watching";
      log.event("AUTOPLAY", "idle watch started", {
        idleContext,
        thresholdMs: LANDING_SETUP_IDLE_MS,
        pathname: location.pathname,
        pollMs: IDLE_POLL_MS,
      });
    }

    const timerId = window.setInterval(() => {
      const elapsedMs = Date.now() - useAutoplayStore.getState().lastActivityMs;
      const remainingMs = LANDING_SETUP_IDLE_MS - elapsedMs;
      if (remainingMs <= 0) {
        log.event("AUTOPLAY", "idle threshold reached", {
          idleContext,
          thresholdMs: LANDING_SETUP_IDLE_MS,
          elapsedMs,
        });
        showWarning();
        return;
      }
      if (remainingMs <= 3000) {
        log.event("AUTOPLAY", "idle countdown", {
          idleContext,
          remainingMs: Math.ceil(remainingMs / 1000) * 1000,
          elapsedMs,
        });
      }
    }, IDLE_POLL_MS);

    return () => window.clearInterval(timerId);
  }, [
    councilOnSummary,
    isMuseumMode,
    location.hash,
    location.pathname,
    logIdleInactive,
    meetingliveKey,
    phase,
    setupClaimed,
    showWarning,
  ]);

  if (!isMuseumMode) {
    return null;
  }

  return (
    <>
      {phase === "warning" && (
        <Overlay isActive={true} isBlurred={true} layer="system">
          <AutoplayWarning
            onConfirm={() => {
              log.event("AUTOPLAY", "warning confirmed", { via: "ui_button_or_timeout" });
              bumpAutoplayActivity("warning-confirm");
              void enterAutoplay();
            }}
          />
        </Overlay>
      )}
    </>
  );
}
