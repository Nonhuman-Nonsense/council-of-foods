import { useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import Overlay from "@main/overlay/Overlay";
import AutoplayWarning from "@main/overlay/AutoplayWarning";
import { fetchAutoplayMeetingId } from "@api/fetchAutoplayMeeting";
import { useButton } from "@/museum/button/useButton";
import { useButtonStore } from "@/museum/button/buttonStore";
import { useCouncilSettings } from "@/settings/councilSettings";
import { isRootPath, stripLanguagePrefix, useRouting } from "@/routing";
import routes from "@/routes.json";
import {
  AUTOPLAY_NEXT_MEETING_MS,
  bumpAutoplayActivity,
  SETUP_IDLE_MS,
  useAutoplayStore,
} from "./autoplayStore";
import { log } from "@/logger";
import { useErrorStore } from "@main/overlay/errorStore";

const IDLE_POLL_MS = 1_000;
const FETCH_RETRY_MS = 5_000;

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
  | "connection_error"
  | "no_idle_context";

export default function AutoplayCoordinator({
  meetingliveKey,
  setMeetingliveKey,
}: AutoplayCoordinatorProps): React.ReactElement | null {
  const connectionError = useErrorStore((s) => s.connectionError);
  const { isMuseumMode } = useCouncilSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const { meetingPath } = useRouting();
  const button = useButton("autoplay");

  const phase = useAutoplayStore((state) => state.phase);
  const councilOnSummary = useAutoplayStore((state) => state.councilOnSummary);
  const summaryProtocolFinished = useAutoplayStore((state) => state.summaryProtocolFinished);
  const setPhase = useAutoplayStore((state) => state.setPhase);

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
    log.event("AUTOPLAY", "exit to root", { via: "hardware_button" });
    setPhase("off");
    window.location.href = "/";
  }, []);

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
    if (connectionError) {
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
    connectionError,
    councilOnSummary,
    i18n.language,
    isMuseumMode,
    meetingPath,
    navigate,
    phase,
    summaryProtocolFinished,
  ]);

  useEffect(() => {
    if (!isMuseumMode) {
      logIdleInactive("not_museum");
      return;
    }
    if (connectionError) {
      logIdleInactive("connection_error");
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
