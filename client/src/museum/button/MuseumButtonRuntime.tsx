import { useEffect } from "react";
import {
  PUSH_TO_TALK_CHANGE_EVENT,
} from "@/settings/councilSettings";
import { APP_MODE_CHANGE_EVENT } from "@/museum/appMode";
import { isMuseumButtonBridgeActive } from "./buttonPolicy";

type ButtonServiceModule = typeof import("./buttonService");

/**
 * Lazy-loaded museum button runtime. Only mount when app mode is museum so the
 * bridge client code stays out of the default web bundle.
 */
export default function MuseumButtonRuntime(): null {
  useEffect(() => {
    let serviceModule: ButtonServiceModule | null = null;
    let disposed = false;

    async function sync(reason: string): Promise<void> {
      serviceModule ??= await import("./buttonService");
      if (disposed) return;

      if (isMuseumButtonBridgeActive()) {
        serviceModule.buttonService.start();
        await serviceModule.buttonService.sync(reason);
        return;
      }

      serviceModule.buttonService.stop();
    }

    void sync("mount");

    const onPushToTalkChange = () => {
      void sync("push-to-talk");
    };

    const onAppModeChange = () => {
      void sync("app-mode");
    };

    window.addEventListener(PUSH_TO_TALK_CHANGE_EVENT, onPushToTalkChange);
    window.addEventListener(APP_MODE_CHANGE_EVENT, onAppModeChange);

    return () => {
      disposed = true;
      window.removeEventListener(PUSH_TO_TALK_CHANGE_EVENT, onPushToTalkChange);
      window.removeEventListener(APP_MODE_CHANGE_EVENT, onAppModeChange);
      serviceModule?.buttonService.stop();
    };
  }, []);

  return null;
}
