import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import Overlay from "@main/overlay/Overlay";
import AutoplayWarning from "@main/overlay/AutoplayWarning";
import { fetchAutoplayMeetingId } from "@api/fetchAutoplayMeeting";
import { useButton } from "@/museum/button/useButton";
import { useButtonStore } from "@/museum/button/buttonStore";
import { useCouncilSettings } from "@/settings/councilSettings";
import { useMeetingSetupStore } from "@newMeeting/meetingSetupStore";
import { isMeetingPath, isRootPath, stripLanguagePrefix, useRouting } from "@/routing";
import routes from "@/routes.json";
import { bumpAutoplayActivity, getAutoplayLastActivityMs } from "./autoplayActivity";
import { log } from "@/logger";

export type AutoplayPhase = "off" | "warning" | "active";

const LANDING_SETUP_IDLE_MS = 9000;
const SUMMARY_IDLE_MS = 60_000;
const LOOP_IDLE_MS = 35_000;
const IDLE_POLL_MS = 1_000;
const FETCH_RETRY_MS = 5_000;

export interface AutoplayCoordinatorProps {
  autoplayPhase: AutoplayPhase;
  setAutoplayPhase: Dispatch<SetStateAction<AutoplayPhase>>;
  meetingliveKey: string | null;
  setMeetingliveKey: (key: string | null) => void;
  councilSummaryActive: boolean;
  onRegisterMeetingEnd: (handler: (() => void) | null) => void;
}

type IdleInactiveReason =
  | "not_museum"
  | "phase_not_off"
  | "setup_hash"
  | "setup_button_claim"
  | "live_meeting_playing"
  | "no_idle_context";

export default function AutoplayCoordinator({
  autoplayPhase,
  setAutoplayPhase,
  meetingliveKey,
  setMeetingliveKey,
  councilSummaryActive,
  onRegisterMeetingEnd,
}: AutoplayCoordinatorProps): React.ReactElement | null {
  const { isMuseumMode } = useCouncilSettings();
  const location = useLocation();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const { rootPath, meetingPath } = useRouting();
  const button = useButton("autoplay");

  const awaitingLoopRef = useRef(false);
  const [awaitingLoop, setAwaitingLoop] = useState(false);
  const enterInFlightRef = useRef(false);
  const meetingEndHandledRef = useRef(false);
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
      phase: autoplayPhase,
      pathname: location.pathname,
      thresholdMs: LANDING_SETUP_IDLE_MS,
    });
  }, [isMuseumMode]);

  useEffect(() => {
    if (!isMuseumMode) {
      return;
    }
    log.event("AUTOPLAY", "phase change", { phase: autoplayPhase });
  }, [autoplayPhase, isMuseumMode]);

  const enterAutoplay = useCallback(async () => {
    if (enterInFlightRef.current) {
      log.event("AUTOPLAY", "enter skipped", { reason: "already_in_flight" });
      return;
    }
    enterInFlightRef.current = true;
    log.event("AUTOPLAY", "enter started");
    setAutoplayPhase("active");
    awaitingLoopRef.current = false;
    setAwaitingLoop(false);
    setMeetingliveKey(null);
    bumpAutoplayActivity("enter-autoplay");

    const language = i18n.language.toLowerCase().startsWith("sv") ? "sv" : "en";

    try {
      const meetingId = await fetchAutoplayMeetingId(language);
      navigate(meetingPath(meetingId), { replace: true });
      log.event("AUTOPLAY", "enter navigated", { meetingId, language });
    } catch (error) {
      log.event("ERROR", "autoplay enter failed", error);
      setAutoplayPhase("off");
      window.setTimeout(() => {
        enterInFlightRef.current = false;
      }, FETCH_RETRY_MS);
      return;
    }

    enterInFlightRef.current = false;
  }, [i18n.language, meetingPath, navigate, setAutoplayPhase, setMeetingliveKey]);

  const dismissWarning = useCallback(() => {
    log.event("AUTOPLAY", "warning dismissed", { via: "hardware_button" });
    setAutoplayPhase("off");
    bumpAutoplayActivity("warning-dismissed");
  }, [setAutoplayPhase]);

  const exitAutoplay = useCallback(() => {
    log.event("AUTOPLAY", "exit to landing", { via: "hardware_button" });
    setAutoplayPhase("off");
    awaitingLoopRef.current = false;
    setAwaitingLoop(false);
    useMeetingSetupStore.getState().resetStore();
    window.location.href = rootPath;
  }, [rootPath, setAutoplayPhase]);

  const showWarning = useCallback(() => {
    setAutoplayPhase((phase: AutoplayPhase) => {
      if (phase !== "off") {
        return phase;
      }
      log.event("AUTOPLAY", "warning shown");
      bumpAutoplayActivity("warning-shown");
      return "warning";
    });
  }, [setAutoplayPhase]);

  useEffect(() => {
    meetingEndHandledRef.current = false;
  }, [location.pathname]);

  const handleMeetingEnd = useCallback(() => {
    if (autoplayPhase !== "active" || meetingEndHandledRef.current) {
      return;
    }
    meetingEndHandledRef.current = true;
    awaitingLoopRef.current = true;
    setAwaitingLoop(true);
    bumpAutoplayActivity("meeting-end");
    log.event("AUTOPLAY", "meeting end — loop idle started", { loopIdleMs: LOOP_IDLE_MS });
  }, [autoplayPhase]);

  useEffect(() => {
    onRegisterMeetingEnd(handleMeetingEnd);
    return () => onRegisterMeetingEnd(null);
  }, [handleMeetingEnd, onRegisterMeetingEnd]);

  useEffect(() => {
    if (!isMuseumMode) {
      return;
    }
    bumpAutoplayActivity("pathname-change");
  }, [isMuseumMode, location.pathname]);

  useEffect(() => {
    if (!isMuseumMode) {
      return;
    }
    return useButtonStore.subscribe((state, prevState) => {
      if (state.pressed && !prevState.pressed) {
        bumpAutoplayActivity("hardware-button");
      }
    });
  }, [isMuseumMode]);

  useEffect(() => {
    if (!isMuseumMode || autoplayPhase === "off") {
      return;
    }

    button.claim();
    button.setLed("pulse");

    return () => {
      button.release();
    };
  }, [autoplayPhase, button.claim, button.release, button.setLed, isMuseumMode]);

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

    if (autoplayPhase === "warning") {
      dismissWarning();
      return;
    }

    if (autoplayPhase === "active") {
      exitAutoplay();
    }
  }, [autoplayPhase, button.pressed, dismissWarning, exitAutoplay, isMuseumMode]);

  useEffect(() => {
    if (!isMuseumMode) {
      logIdleInactive("not_museum");
      return;
    }
    if (autoplayPhase !== "off") {
      logIdleInactive("phase_not_off", { phase: autoplayPhase });
      return;
    }

    const withoutLang = stripLanguagePrefix(location.pathname);
    const onSetupRoute = withoutLang === `/${routes.newMeeting}`;
    const onLanding = isRootPath(location.pathname);
    const onSummary =
      isMeetingPath(location.pathname) &&
      councilSummaryActive &&
      (!meetingliveKey || councilSummaryActive);
    const liveMeetingPlaying = Boolean(meetingliveKey) && !councilSummaryActive;

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

    const thresholdMs = onSummary ? SUMMARY_IDLE_MS : LANDING_SETUP_IDLE_MS;
    const idleContext = onSummary ? "summary" : onLanding || onSetupRoute ? "setup" : null;

    if (!idleContext) {
      logIdleInactive("no_idle_context", { pathname: location.pathname });
      return;
    }

    if (lastIdleInactiveReasonRef.current !== "watching") {
      lastIdleInactiveReasonRef.current = "watching";
      log.event("AUTOPLAY", "idle watch started", {
        idleContext,
        thresholdMs,
        pathname: location.pathname,
        pollMs: IDLE_POLL_MS,
      });
    }

    const timerId = window.setInterval(() => {
      const elapsedMs = Date.now() - getAutoplayLastActivityMs();
      const remainingMs = thresholdMs - elapsedMs;
      if (remainingMs <= 0) {
        log.event("AUTOPLAY", "idle threshold reached", {
          idleContext,
          thresholdMs,
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
    autoplayPhase,
    councilSummaryActive,
    isMuseumMode,
    location.hash,
    location.pathname,
    logIdleInactive,
    meetingliveKey,
    setupClaimed,
    showWarning,
  ]);

  useEffect(() => {
    if (!isMuseumMode || autoplayPhase !== "active" || !awaitingLoop) {
      return;
    }

    log.event("AUTOPLAY", "loop watch started", { loopIdleMs: LOOP_IDLE_MS });

    const timerId = window.setInterval(() => {
      if (!awaitingLoopRef.current) {
        return;
      }
      const elapsedMs = Date.now() - getAutoplayLastActivityMs();
      if (elapsedMs < LOOP_IDLE_MS) {
        return;
      }

      log.event("AUTOPLAY", "loop idle threshold reached", { elapsedMs, loopIdleMs: LOOP_IDLE_MS });
      awaitingLoopRef.current = false;
      setAwaitingLoop(false);
      void (async () => {
        const language = i18n.language.toLowerCase().startsWith("sv") ? "sv" : "en";
        try {
          const meetingId = await fetchAutoplayMeetingId(language);
          bumpAutoplayActivity("loop-next-meeting");
          navigate(meetingPath(meetingId), { replace: true });
          log.event("AUTOPLAY", "loop navigated", { meetingId, language });
        } catch (error) {
          log.event("ERROR", "autoplay loop failed", error);
          awaitingLoopRef.current = true;
          setAwaitingLoop(true);
          bumpAutoplayActivity("loop-retry");
        }
      })();
    }, IDLE_POLL_MS);

    return () => window.clearInterval(timerId);
  }, [autoplayPhase, awaitingLoop, i18n.language, isMuseumMode, meetingPath, navigate]);

  if (!isMuseumMode) {
    return null;
  }

  return (
    <>
      {autoplayPhase === "warning" && (
        <Overlay isActive={true} isBlurred={true}>
          <AutoplayWarning
            onConfirm={() => {
              log.event("AUTOPLAY", "warning confirmed", { via: "ui_button_or_timeout" });
              void enterAutoplay();
            }}
          />
        </Overlay>
      )}
    </>
  );
}
