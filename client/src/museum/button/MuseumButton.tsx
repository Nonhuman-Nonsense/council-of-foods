import { useEffect } from "react";
import { isButtonBridgeAvailable } from "./buttonBridge";
import { useCouncilSettings } from "@/settings/councilSettings";
import { useButtonStore } from "./buttonStore";
import ButtonLedDebugOverlay, { useButtonLedDebugOverlay } from "./buttonDebug";

/**
 * Push-to-talk button lifecycle: keyboard (Space) when PTT is enabled in any
 * app mode; hardware bridge only in museum mode when the bridge is available.
 */
export default function MuseumButton(): React.ReactElement | null {
  const { isMuseumMode, agentMode } = useCouncilSettings();
  const { ledDebugOverlay } = useButtonLedDebugOverlay();
  const bridgeActive = isMuseumMode && agentMode === "ptt" && isButtonBridgeAvailable();

  // Space-as-PTT works in web and museum whenever agent mode is ptt.
  useEffect(() => {
    if (agentMode !== "ptt") {
      return;
    }
    useButtonStore.getState().init();
  }, [agentMode]);

  useEffect(() => {
    if (!bridgeActive) {
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
  }, [bridgeActive]);

  return ledDebugOverlay ? <ButtonLedDebugOverlay /> : null;
}
