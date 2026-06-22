import { useEffect } from "react";
import type { ButtonTransportStatus } from "./transport";
import { useButtonStore } from "./buttonStore";
import type { ButtonLedMode } from "./ledMode";
import type { ButtonLedOwner } from "./ledIntent";

export type ButtonConnectionState = {
  bridgeStatus: ButtonTransportStatus;
  bridgeError: string | null;
  bridgeAvailable: boolean;
  serialConnected: boolean;
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

export function useButtonPressed(active: boolean): boolean {
  return useButtonStore((state) => (active ? state.pressed : false));
}

export function useRawPressed(active: boolean): boolean {
  return useButtonStore((state) => (active ? state.rawPressed : false));
}

/** Declare desired LED mode for a screen; highest-priority active owner wins. */
export function useButtonLed(owner: ButtonLedOwner, mode: ButtonLedMode, active = true): void {
  useEffect(() => {
    if (!active) {
      return;
    }

    useButtonStore.getState().registerLedIntent(owner, mode);
    return () => {
      useButtonStore.getState().registerLedIntent(owner, null);
    };
  }, [owner, mode, active]);
}
