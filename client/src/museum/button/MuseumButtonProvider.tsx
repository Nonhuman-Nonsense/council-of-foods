import { useEffect, useState } from "react";
import { isButtonBridgeAvailable } from "@/button/config";
import { useAppMode } from "@/museum/useAppMode";
import {
  getPushToTalk,
  PUSH_TO_TALK_CHANGE_EVENT,
  type PushToTalkChangeDetail,
} from "@/settings/councilSettings";
import { useButtonStore } from "@stores/useButtonStore";

/**
 * Museum button connection lifecycle. Mount when app mode is museum so bridge
 * client code stays out of the default web bundle.
 */
export default function MuseumButtonProvider(): null {
  const { isMuseumMode } = useAppMode();
  const [pushToTalk, setPushToTalk] = useState(getPushToTalk);
  const active = isMuseumMode && pushToTalk && isButtonBridgeAvailable();

  useEffect(() => {
    function onPushToTalkChange(event: Event): void {
      setPushToTalk((event as CustomEvent<PushToTalkChangeDetail>).detail);
    }

    window.addEventListener(PUSH_TO_TALK_CHANGE_EVENT, onPushToTalkChange);
    return () => window.removeEventListener(PUSH_TO_TALK_CHANGE_EVENT, onPushToTalkChange);
  }, []);

  useEffect(() => {
    if (!active) {
      void useButtonStore.getState().disconnect();
      return;
    }

    const store = useButtonStore.getState();
    store.init();
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
  }, [active]);

  return null;
}
