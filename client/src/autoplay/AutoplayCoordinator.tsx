import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import Overlay from "@main/overlay/Overlay";
import AutoplayWarning from "@main/overlay/AutoplayWarning";
import { useButton } from "@/museum/button/useButton";
import { useButtonStore } from "@/museum/button/buttonStore";
import { useCouncilSettings } from "@/settings/councilSettings";
import { isRootPath, reloadApp, stripLanguagePrefix } from "@/navigation";
import routes from "@/routes.json";
import { getPreferredLanguage } from "@/i18n";
import {
  AUTOPLAY_NEXT_MEETING_MS,
  bumpAutoplayActivity,
  SETUP_IDLE_MS,
  useAutoplayStore,
} from "./autoplayStore";
import { log } from "@/logger";
import { setUnrecoverableError, useErrorStore } from "@main/overlay/errorStore";

const IDLE_POLL_MS = 1_000;

/** Setup-entry flow: welcome screen (/) and in-progress meeting setup (/new). */
function isInSetupEntryFlow(pathname: string): boolean {
  const onLanding = isRootPath(pathname);
  const withoutLang = stripLanguagePrefix(pathname);
  const onNewMeetingPath = withoutLang === `/${routes.newMeeting}`;
  return onLanding || onNewMeetingPath;
}

export interface AutoplayCoordinatorProps {
  meetingliveKey: string | null;
  setMeetingliveKey: (key: string | null) => void;
}

type IdleInactiveReason =
  | "not_museum"
  | "phase_not_off"
  | "staff_hash"
  | "staff_button_claim"
  | "live_meeting_playing"
  | "system_error"
  | "no_idle_context";

export default function AutoplayCoordinator({
  meetingliveKey,
  setMeetingliveKey,
}: AutoplayCoordinatorProps): React.ReactElement | null {
  const connectionError = useErrorStore((s) => s.connectionError);
  const unrecoverableError = useErrorStore((s) => s.unrecoverableError);
  const { isMuseumMode } = useCouncilSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const button = useButton("autoplay");

  const phase = useAutoplayStore((state) => state.phase);
  const councilOnSummary = useAutoplayStore((state) => state.councilOnSummary);
  const summaryProtocolFinished = useAutoplayStore((state) => state.summaryProtocolFinished);
  const setPhase = useAutoplayStore((state) => state.setPhase);
  const navigateToAutoplayMeeting = useAutoplayStore((state) => state.navigateToAutoplayMeeting);

  const enterInFlightRef = useRef(false);
  const prevPressedRef = useRef(false);
  const lastIdleInactiveReasonRef = useRef<IdleInactiveReason | "watching" | null>(null);
  const staffClaimed = useButtonStore((state) => state.claims.staff === true);

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
      thresholdMs: SETUP_IDLE_MS,
    });
  }, [isMuseumMode]);

  const startAutoplayMeeting = useCallback(async () => {
    try {
      const language = getPreferredLanguage();
      await i18n.changeLanguage(language);
      await navigateToAutoplayMeeting(navigate, language);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.event("ERROR", "autoplay failed", error);
      setUnrecoverableError({ message, source: "autoplay", cause: error });
    }
  }, [i18n, navigate, navigateToAutoplayMeeting]);

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

    await startAutoplayMeeting();
    enterInFlightRef.current = false;
  }, [setMeetingliveKey, setPhase, startAutoplayMeeting]);

  const dismissWarning = useCallback(() => {
    log.event("AUTOPLAY", "warning dismissed", { via: "hardware_button" });
    setPhase("off");
    bumpAutoplayActivity("warning-dismissed");
  }, [setPhase]);

  const exitAutoplay = useCallback(() => {
    log.event("AUTOPLAY", "exit to root", { via: "hardware_button" });
    setPhase("off");
    void reloadApp();
  }, [setPhase]);

  const showWarning = useCallback(() => {
    if (useAutoplayStore.getState().phase !== "off") {
      return;
    }
    log.event("AUTOPLAY", "warning shown");
    bumpAutoplayActivity("warning-shown");
    setPhase("warning");
  }, [setPhase]);

  useEffect(() => {
    if (!isMuseumMode || !(connectionError || unrecoverableError)) {
      return;
    }
    if (useAutoplayStore.getState().phase === "warning") {
      log.event("AUTOPLAY", "warning cleared", { reason: "system_error" });
      setPhase("off");
    }
  }, [connectionError, isMuseumMode, setPhase, unrecoverableError]);

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
    if (connectionError || unrecoverableError) {
      return;
    }
    if (!councilOnSummary) {
      return;
    }
    if (!summaryProtocolFinished) {
      return;
    }

    log.event("AUTOPLAY", "summary reading done — next meeting scheduled", {
      delayMs: AUTOPLAY_NEXT_MEETING_MS,
    });

    const timerId = window.setTimeout(() => {
      void (async () => {
        await startAutoplayMeeting();
        if (useErrorStore.getState().unrecoverableError == null) {
          bumpAutoplayActivity("loop-next-meeting");
        }
      })();
    }, AUTOPLAY_NEXT_MEETING_MS);

    return () => window.clearTimeout(timerId);
  }, [
    connectionError,
    councilOnSummary,
    isMuseumMode,
    startAutoplayMeeting,
    phase,
    summaryProtocolFinished,
    unrecoverableError,
  ]);

  useEffect(() => {
    if (!isMuseumMode) {
      logIdleInactive("not_museum");
      return;
    }
    if (connectionError || unrecoverableError) {
      logIdleInactive("system_error");
      return;
    }
    if (phase !== "off") {
      logIdleInactive("phase_not_off", { phase });
      return;
    }

    const liveMeetingPlaying = Boolean(meetingliveKey) && !councilOnSummary;

    if (location.hash === "#staff") {
      logIdleInactive("staff_hash");
      return;
    }
    if (staffClaimed) {
      logIdleInactive("staff_button_claim");
      return;
    }
    if (liveMeetingPlaying) {
      logIdleInactive("live_meeting_playing");
      return;
    }

    const idleContext = isInSetupEntryFlow(location.pathname) ? "setup" : null;

    if (!idleContext) {
      logIdleInactive("no_idle_context", { pathname: location.pathname });
      return;
    }

    if (lastIdleInactiveReasonRef.current !== "watching") {
      lastIdleInactiveReasonRef.current = "watching";
      log.event("AUTOPLAY", "idle watch started", {
        idleContext,
        thresholdMs: SETUP_IDLE_MS,
        pathname: location.pathname,
        pollMs: IDLE_POLL_MS,
      });
    }

    const timerId = window.setInterval(() => {
      const elapsedMs = Date.now() - useAutoplayStore.getState().lastActivityMs;
      const remainingMs = SETUP_IDLE_MS - elapsedMs;
      if (remainingMs <= 0) {
        log.event("AUTOPLAY", "idle threshold reached", {
          idleContext,
          thresholdMs: SETUP_IDLE_MS,
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
    connectionError,
    councilOnSummary,
    isMuseumMode,
    location.hash,
    location.pathname,
    logIdleInactive,
    meetingliveKey,
    phase,
    staffClaimed,
    showWarning,
    unrecoverableError,
  ]);

  if (!isMuseumMode) {
    return null;
  }

  return (
    <>
      {phase === "warning" && !(connectionError || unrecoverableError) && (
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
