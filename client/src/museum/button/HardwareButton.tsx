import { useEffect } from "react";
import { isButtonBridgeAvailable } from "./buttonBridge";
import { useButtonStore } from "./buttonStore";

/**
 * USB talk-button lifecycle over the local bridge daemon. Mounted only while
 * staff have the hardware button switched on — that setting is independent of
 * the app mode, so a laptop in web mode can drive a real button for testing.
 *
 * Reconnects when the tab becomes visible again: the daemon may have restarted,
 * or the OS may have suspended the socket while the kiosk was idle.
 */
export default function HardwareButton(): null {
  const available = isButtonBridgeAvailable();

  useEffect(() => {
    if (!available) {
      void useButtonStore.getState().disconnect();
      return;
    }

    const store = useButtonStore.getState();
    store.enableAutoReconnect();
    void store.connect();

    function onVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        void useButtonStore.getState().connect();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void useButtonStore.getState().disconnect();
    };
  }, [available]);

  return null;
}
