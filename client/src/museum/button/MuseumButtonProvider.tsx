import { useEffect, useState } from "react";
import { isButtonBridgeAvailable } from "./config";
import { useAppMode } from "@/museum/useAppMode";
import {
  getPushToTalk,
  PUSH_TO_TALK_CHANGE_EVENT,
  type PushToTalkChangeDetail,
} from "@/settings/councilSettings";
import { useButtonStore } from "./buttonStore";

/**
 * Push-to-talk button lifecycle: keyboard (Space) when PTT is enabled in any
 * app mode; hardware bridge only in museum mode when the bridge is available.
 */
export default function MuseumButtonProvider(): null {
  const { isMuseumMode } = useAppMode();
  const [pushToTalk, setPushToTalk] = useState(getPushToTalk);
  const bridgeActive = isMuseumMode && pushToTalk && isButtonBridgeAvailable();

  useEffect(() => {
    function onPushToTalkChange(event: Event): void {
      setPushToTalk((event as CustomEvent<PushToTalkChangeDetail>).detail);
    }

    window.addEventListener(PUSH_TO_TALK_CHANGE_EVENT, onPushToTalkChange);
    return () => window.removeEventListener(PUSH_TO_TALK_CHANGE_EVENT, onPushToTalkChange);
  }, []);

  // Space-as-PTT works in web and museum whenever push-to-talk is on.
  useEffect(() => {
    if (!pushToTalk) {
      return;
    }
    useButtonStore.getState().init();
  }, [pushToTalk]);

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

  return null;
}
