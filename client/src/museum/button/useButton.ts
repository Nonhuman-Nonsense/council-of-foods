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
   * when disarmed, pulsing when armed, solid while pressed), so owners
   * never speak of lights and a web owner needs no light to exist.
   */
  setArmed: (armed: boolean) => void;
  /** The on-screen mic button held (true) or let go — the same press as space or the hardware button. */
  pressFromScreen: (down: boolean) => void;
  /** End the press from the owner's side: the hold is ignored until it is let go. */
  endPress: () => void;
  /**
   * Routed press — true only when this owner is buttonOwner and armed. Push-to-talk
   * everywhere: the mic is open exactly while this is.
   */
  pressed: boolean;
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

  const pressFromScreen = useCallback(
    (down: boolean) => {
      useButtonStore.getState().setButtonScreenDown(owner, down);
    },
    [owner],
  );

  const endPress = useCallback(() => {
    useButtonStore.getState().endButtonPress(owner);
  }, [owner]);

  return useMemo(
    () => ({ claim, release, setArmed, pressFromScreen, endPress, pressed, isOwner }),
    [claim, release, setArmed, pressFromScreen, endPress, pressed, isOwner],
  );
}

/** How long "hold to talk" stays up after a click too short to be a hold. */
const HOLD_HINT_MS = 3_000;

/**
 * True for a few seconds after a press too short to say anything — a click on a button
 * that has to be held. Whoever shows a mic button shows the hint with it.
 */
export function useHoldHint(): boolean {
  const shortPressAt = useButtonStore((state) => state.shortPressAt);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (shortPressAt == null) return;
    setShown(true);
    const timer = window.setTimeout(() => setShown(false), HOLD_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [shortPressAt]);
  return shown;
}
