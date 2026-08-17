import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchButtonBridgeHealth,
  logBridgeHealthChangeIfNeeded,
  type ButtonBridgeHealthState,
  type ButtonTransportStatus,
} from "./buttonBridge";
import {
  useButtonStore,
  type ButtonLedMode,
  type ButtonOwner,
} from "./buttonStore";

export type { ButtonLedMode, ButtonOwner };

export type ButtonConnectionState = {
  bridgeStatus: ButtonTransportStatus;
  bridgeError: string | null;
  bridgeAvailable: boolean;
  serialConnected: boolean;
};

export type ButtonHandle = {
  claim: () => void;
  release: () => void;
  /**
   * Whether this owner can take a press right now. The gate every press
   * passes, in both modes — the hardware LED is then derived from it (dark
   * when disarmed, pulsing when armed, solid while `wantsMic`), so owners
   * never speak of lights and a web owner needs no light to exist.
   */
  setArmed: (armed: boolean) => void;
  /**
   * Toggle the latch from an on-screen control, exactly as a tap would. Only
   * meaningful where `capabilities.latchOnTap` allows latching at all.
   */
  toggleLatch: () => void;
  /** End a latched-open mic from the owner's side; a no-op if not latched. */
  clearLatch: () => void;
  /** Routed press — true only when this owner is buttonOwner and armed. */
  pressed: boolean;
  /**
   * The visitor wants the mic open right now: either physically holding, or —
   * where `capabilities.latchOnTap` allows it — latched on by an earlier tap.
   * Mic consumers (setup agent, human input, meta agent) read this instead of
   * `pressed`; everything else should keep reading `pressed`, since latching
   * must not affect edge-triggered actions like a restart-on-press.
   */
  wantsMic: boolean;
  /** Whether this owner won the priority merge right now. */
  isOwner: boolean;
};

export function useButtonConnection(active: boolean): ButtonConnectionState {
  const bridgeStatus = useButtonStore((state) =>
    active ? state.bridgeStatus : "disconnected",
  );
  const bridgeError = useButtonStore((state) => (active ? state.bridgeError : null));
  const bridgeAvailable = useButtonStore((state) =>
    active ? state.bridgeAvailable : false,
  );
  const serialConnected = useButtonStore((state) =>
    active ? state.serialDeviceConnected : false,
  );

  return { bridgeStatus, bridgeError, bridgeAvailable, serialConnected };
}

export function useButtonBridgeHealth(enabled: boolean): ButtonBridgeHealthState {
  const [health, setHealth] = useState<ButtonBridgeHealthState>({ status: "checking" });
  const previousHealthRef = useRef<ButtonBridgeHealthState | null>(null);

  useEffect(() => {
    if (!enabled) {
      const next = { status: "not_running" as const };
      logBridgeHealthChangeIfNeeded(previousHealthRef.current, next);
      previousHealthRef.current = next;
      setHealth(next);
      return;
    }

    let cancelled = false;

    async function poll(): Promise<void> {
      const next = await fetchButtonBridgeHealth();
      if (!cancelled) {
        logBridgeHealthChangeIfNeeded(previousHealthRef.current, next);
        previousHealthRef.current = next;
        setHealth(next);
      }
    }

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled]);

  return health;
}

export function useButton(owner: ButtonOwner): ButtonHandle {
  const pressed = useButtonStore((state) => state.buttonOwner === owner && state.pressed);
  // `armed` is required explicitly: `pressed` already implies it, but a latch
  // set while disarmed (a mic-button click that also wakes the agent) lives
  // until the arming that follows, and a disarmed button must want nothing.
  const wantsMic = useButtonStore(
    (state) => state.buttonOwner === owner && state.armed && (state.pressed || state.latched),
  );
  const isOwner = useButtonStore((state) => state.buttonOwner === owner);

  const claim = useCallback(() => {
    useButtonStore.getState().claimButton(owner);
  }, [owner]);

  const release = useCallback(() => {
    useButtonStore.getState().releaseButton(owner);
  }, [owner]);

  const setArmed = useCallback(
    (armed: boolean) => {
      useButtonStore.getState().setButtonArmed(owner, armed);
    },
    [owner],
  );

  const toggleLatch = useCallback(() => {
    useButtonStore.getState().toggleButtonLatch(owner);
  }, [owner]);

  const clearLatch = useCallback(() => {
    useButtonStore.getState().clearButtonLatch(owner);
  }, [owner]);

  return useMemo(
    () => ({ claim, release, setArmed, toggleLatch, clearLatch, pressed, wantsMic, isOwner }),
    [claim, release, setArmed, toggleLatch, clearLatch, pressed, wantsMic, isOwner],
  );
}
