import { useCallback, useMemo } from "react";
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
