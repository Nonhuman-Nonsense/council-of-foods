import { useEffect } from "react";
import type { ButtonTransportStatus } from "./transport";
import { useButtonStore } from "./buttonStore";
import type { ButtonLedMode } from "./ledMode";
import type { ButtonOwner } from "./buttonIntent";

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

/** Routed press: true only when this owner won button intent arbitration. */
export function useButtonPressed(owner: ButtonOwner): boolean {
  return useButtonStore((state) => state.pressOwner === owner && state.pressed);
}

export function useButtonPressOwner(): ButtonOwner | null {
  return useButtonStore((state) => state.pressOwner);
}

/** Physical button/keyboard state — below intent routing (e.g. HumanInput pre-warm). */
export function useRawPressed(active: boolean): boolean {
  return useButtonStore((state) => (active ? state.rawPressed : false));
}

/** Declare desired LED mode for a screen; highest-priority active owner wins. */
export function useButtonLed(owner: ButtonOwner, mode: ButtonLedMode, active = true): void {
  useEffect(() => {
    if (!active) {
      return;
    }

    useButtonStore.getState().registerButtonIntent(owner, mode);
    return () => {
      useButtonStore.getState().registerButtonIntent(owner, null);
    };
  }, [owner, mode, active]);
}
