import { useSyncExternalStore } from "react";

/**
 * Whether the browser has a network at all. It can tell "no network" (no cable, no Wi-Fi) from
 * the rest, but not a router without internet from a server that is down: both are "online".
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

function subscribeOnline(onChange: () => void): () => void {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

/**
 * What to say once the server has stayed out of reach: specific enough that whoever stands at
 * an installation knows to check the network, the same words the kiosk's own offline page uses
 * (museum/kiosk/offline.html).
 */
export function connectionLostCopy(online: boolean) {
  return online
    ? ({ title: "error.serverUnreachable", detail: "error.serverUnreachableDetail" } as const)
    : ({ title: "error.noInternet", detail: "error.noInternetDetail" } as const);
}
