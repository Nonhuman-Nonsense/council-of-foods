import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import Overlay from "@main/overlay/Overlay";
import AutoplayWarning from "@main/overlay/AutoplayWarning";
import { useButton } from "@/museum/button/useButton";
import { useButtonStore } from "@/museum/button/buttonStore";
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

  // Mounted only under capabilities.autoplay, so reaching here means active.
  useEffect(() => {
    log.event("AUTOPLAY", "coordinator active", {
      phase,
      pathname: location.pathname,
      thresholdMs: SETUP_IDLE_MS,
    });
  }, []);

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
    if (!(connectionError || unrecoverableError)) {
      return;
    }
    if (useAutoplayStore.getState().phase === "warning") {
      log.event("AUTOPLAY", "warning cleared", { reason: "system_error" });
      setPhase("off");
    }
  }, [connectionError, setPhase, unrecoverableError]);

  useEffect(() => {
    bumpAutoplayActivity("pathname");
  }, [location.pathname]);

  useEffect(() => {
    return useButtonStore.subscribe((state, prevState) => {
      if (state.pressed && !prevState.pressed) {
        bumpAutoplayActivity("button-press");
      }
    });
  }, []);

  useEffect(() => {
    if (phase === "off") {
      return;
    }

    button.claim();
    button.setArmed(true);

    return () => {
      button.release();
    };
  }, [phase, button.claim, button.release, button.setArmed]);

  useEffect(() => {
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
  }, [phase, button.pressed, dismissWarning, exitAutoplay]);

  useEffect(() => {
    if (phase !== "active") {
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
    startAutoplayMeeting,
    phase,
    summaryProtocolFinished,
    unrecoverableError,
  ]);

  useEffect(() => {
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
    location.hash,
    location.pathname,
    logIdleInactive,
    meetingliveKey,
    phase,
    staffClaimed,
    showWarning,
    unrecoverableError,
  ]);

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
