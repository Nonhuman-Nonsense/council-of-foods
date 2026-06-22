import { useEffect, useRef, useState } from "react";

import type { ButtonTransportStatus } from "@/button/transport";

type ButtonState = {
  pressed: boolean;
  rawPressed: boolean;
  bridgeStatus: ButtonTransportStatus;
  bridgeError: string | null;
  bridgeAvailable: boolean;
};

type LazyButtonStore = {
  getState: () => ButtonState;
  subscribe: (listener: () => void) => () => void;
};

async function loadButtonStore(): Promise<LazyButtonStore> {
  const mod = await import("@stores/useButtonStore");
  return mod.useButtonStore as unknown as LazyButtonStore;
}

export function useMuseumButtonSelector<T>(
  active: boolean,
  selector: (state: ButtonState) => T,
  fallback: T,
): T {
  const [value, setValue] = useState<T>(fallback);
  const selectorRef = useRef(selector);
  selectorRef.current = selector;

  useEffect(() => {
    if (!active) {
      setValue(fallback);
      return;
    }

    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    void loadButtonStore().then((useButtonStore) => {
      if (cancelled) return;
      const update = () => setValue(selectorRef.current(useButtonStore.getState()));
      update();
      unsubscribe = useButtonStore.subscribe(update);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [active, fallback]);

  return active ? value : fallback;
}

export function useMuseumButtonBridgeStatus(active: boolean): ButtonState["bridgeStatus"] {
  return useMuseumButtonSelector(active, (state) => state.bridgeStatus, "disconnected");
}

export function useMuseumButtonBridgeError(active: boolean): ButtonState["bridgeError"] {
  return useMuseumButtonSelector(active, (state) => state.bridgeError, null);
}

export function useMuseumButtonBridgeAvailable(active: boolean): boolean {
  return useMuseumButtonSelector(active, (state) => state.bridgeAvailable, false);
}
