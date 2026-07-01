import { useCallback, useEffect, useRef, useState } from "react";
import type { TranslationKey } from "@/i18n";
import { useButtonStore, type BannerContent, type ButtonOwner } from "./buttonStore";

/** Idle window before the banner appears, and again before onIdleTerminal fires. */
export const BUTTON_BANNER_IDLE_MS = 10_000;

export function computeBannerVisible(params: {
  sessionActive: boolean;
  isConnecting: boolean;
  micOpen: boolean;
  agentSpeaking?: boolean;
  idleRemindActive: boolean;
  bannerImmediate?: boolean;
}): boolean {
  if (!params.sessionActive || params.isConnecting || params.micOpen || params.agentSpeaking) {
    return false;
  }
  if (params.bannerImmediate) {
    return true;
  }
  return params.idleRemindActive;
}

export function shouldActivateIdleRemind(
  idleClockStarted: boolean,
  lastActivityMs: number,
  nowMs: number,
  idleMs = BUTTON_BANNER_IDLE_MS,
): boolean {
  if (!idleClockStarted) {
    return false;
  }
  return nowMs - lastActivityMs >= idleMs;
}

export type UseButtonBannerParams = {
  owner: ButtonOwner;
  sessionActive: boolean;
  micOpen: boolean;
  isConnecting: boolean;
  /** Suppress the banner while the agent is producing audio output. */
  agentSpeaking?: boolean;
  /** Bump the idle clock when any of these values change. */
  activityDeps?: readonly unknown[];
  /** Fired once per idle cycle, BUTTON_BANNER_IDLE_MS after idleRemindActive. */
  onIdleTerminal?: () => void;
  /** Return false to suppress the terminal action (e.g. agent speaking). */
  canIdleTerminal?: () => boolean;
  /** Re-arm the idle terminal timer when these change (e.g. agent stopped speaking). */
  terminalDeps?: readonly unknown[];
  /** i18n key for the global ButtonBanner while this owner is active. */
  messageKey?: TranslationKey;
  /** Rich banner payload (e.g. replay preamble). Takes precedence over messageKey in ButtonBanner. */
  bannerContent?: BannerContent;
  /** Show the banner as soon as the session is active (skip idle delay). */
  bannerImmediate?: boolean;
};

export type ButtonBannerHandle = {
  bannerVisible: boolean;
  idleRemindActive: boolean;
  bumpBannerActivity: () => void;
};

/**
 * PTT idle UX: 10s idle → banner, optional +10s → onIdleTerminal.
 * Syncs banner visibility to buttonStore for the global ButtonBanner component.
 */
export function useButtonBanner(params: UseButtonBannerParams): ButtonBannerHandle {
  const {
    owner,
    sessionActive,
    micOpen,
    isConnecting,
    agentSpeaking = false,
    activityDeps = [],
    onIdleTerminal,
    canIdleTerminal,
    terminalDeps = [],
    messageKey,
    bannerContent,
    bannerImmediate = false,
  } = params;

  const [idleClockStarted, setIdleClockStarted] = useState(false);
  const [idleRemindActive, setIdleRemindActive] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const idleTerminalFiredRef = useRef(false);
  const onIdleTerminalRef = useRef(onIdleTerminal);
  const canIdleTerminalRef = useRef(canIdleTerminal);

  onIdleTerminalRef.current = onIdleTerminal;
  canIdleTerminalRef.current = canIdleTerminal;

  const bumpBannerActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIdleRemindActive(false);
    setIdleClockStarted(true);
    idleTerminalFiredRef.current = false;
  }, []);

  useEffect(() => {
    if (!sessionActive) {
      setIdleClockStarted(false);
      setIdleRemindActive(false);
      idleTerminalFiredRef.current = false;
      lastActivityRef.current = Date.now();
      return;
    }

    lastActivityRef.current = Date.now();
    setIdleRemindActive(false);
    setIdleClockStarted(true);
    idleTerminalFiredRef.current = false;
  }, [sessionActive]);

  useEffect(() => {
    if (!sessionActive) {
      return;
    }
    bumpBannerActivity();
  }, [micOpen, sessionActive, bumpBannerActivity]);

  useEffect(() => {
    if (!sessionActive || activityDeps.length === 0) {
      return;
    }
    lastActivityRef.current = Date.now();
    setIdleRemindActive(false);
    idleTerminalFiredRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activityDeps is the intentional trigger list
  }, activityDeps);

  useEffect(() => {
    if (!sessionActive || !idleClockStarted || micOpen || isConnecting) {
      return;
    }

    const tick = () => {
      setIdleRemindActive(
        shouldActivateIdleRemind(idleClockStarted, lastActivityRef.current, Date.now()),
      );
    };

    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [sessionActive, idleClockStarted, micOpen, isConnecting]);

  useEffect(() => {
    if (!idleRemindActive) {
      idleTerminalFiredRef.current = false;
    }
  }, [idleRemindActive]);

  useEffect(() => {
    if (!sessionActive || !idleRemindActive || !onIdleTerminalRef.current) {
      return;
    }
    if (idleTerminalFiredRef.current) {
      return;
    }
    if (canIdleTerminalRef.current && !canIdleTerminalRef.current()) {
      return;
    }

    const timerId = window.setTimeout(() => {
      if (idleTerminalFiredRef.current) {
        return;
      }
      if (canIdleTerminalRef.current && !canIdleTerminalRef.current()) {
        return;
      }
      idleTerminalFiredRef.current = true;
      onIdleTerminalRef.current?.();
    }, BUTTON_BANNER_IDLE_MS);

    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- terminalDeps intentionally trigger re-arm
  }, [sessionActive, idleRemindActive, ...terminalDeps]);

  const bannerVisible = computeBannerVisible({
    sessionActive,
    isConnecting,
    micOpen,
    agentSpeaking,
    idleRemindActive,
    bannerImmediate,
  });

  useEffect(() => {
    if (!sessionActive || !messageKey) {
      useButtonStore.getState().setButtonBannerMessageKey(owner, undefined);
      return;
    }
    useButtonStore.getState().setButtonBannerMessageKey(owner, messageKey);
    return () => {
      useButtonStore.getState().setButtonBannerMessageKey(owner, undefined);
    };
  }, [owner, sessionActive, messageKey]);

  useEffect(() => {
    if (!sessionActive || !bannerContent) {
      useButtonStore.getState().setButtonBannerContent(owner, undefined);
      return;
    }
    useButtonStore.getState().setButtonBannerContent(owner, bannerContent);
    return () => {
      useButtonStore.getState().setButtonBannerContent(owner, undefined);
    };
  }, [owner, sessionActive, bannerContent]);

  useEffect(() => {
    if (!sessionActive) {
      useButtonStore.getState().setButtonBannerVisible(owner, false);
      return;
    }
    useButtonStore.getState().setButtonBannerVisible(owner, bannerVisible);
    return () => {
      useButtonStore.getState().setButtonBannerVisible(owner, false);
    };
  }, [owner, sessionActive, bannerVisible]);

  return { bannerVisible, idleRemindActive, bumpBannerActivity };
}
