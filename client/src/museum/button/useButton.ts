import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchButtonBridgeHealth,
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
  setLed: (mode: ButtonLedMode) => void;
  /** Routed press — true only when this owner is buttonOwner and physical press is down. */
  pressed: boolean;
  /** Physical press below routing. */
  rawPressed: boolean;
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

  useEffect(() => {
    if (!enabled) {
      setHealth({ status: "not_running" });
      return;
    }

    let cancelled = false;

    async function poll(): Promise<void> {
      const next = await fetchButtonBridgeHealth();
      if (!cancelled) {
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
  const rawPressed = useButtonStore((state) => state.rawPressed);
  const isOwner = useButtonStore((state) => state.buttonOwner === owner);

  const claim = useCallback(() => {
    useButtonStore.getState().claimButton(owner);
  }, [owner]);

  const release = useCallback(() => {
    useButtonStore.getState().releaseButton(owner);
  }, [owner]);

  const setLed = useCallback(
    (mode: ButtonLedMode) => {
      useButtonStore.getState().setButtonLed(owner, mode);
    },
    [owner],
  );

  return useMemo(
    () => ({ claim, release, setLed, pressed, rawPressed, isOwner }),
    [claim, release, setLed, pressed, rawPressed, isOwner],
  );
}
