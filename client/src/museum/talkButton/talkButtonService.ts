import {
  PUSH_TO_TALK_CHANGE_EVENT,
  type PushToTalkChangeDetail,
} from "@/settings/councilSettings";
import { usePushToTalkStore } from "@stores/usePushToTalkStore";
import { shouldAutoConnectTalkButton } from "./talkButtonPolicy";

const WATCHDOG_INTERVAL_MS = 2_500;

type TalkButtonService = {
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  sync: () => Promise<void>;
};

function createTalkButtonService(): TalkButtonService {
  let running = false;
  let paused = false;
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;
  let listenersBound = false;

  function clearWatchdog(): void {
    if (watchdogTimer) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
    }
  }

  function startWatchdog(): void {
    if (watchdogTimer) return;
    watchdogTimer = setInterval(() => {
      void tick();
    }, WATCHDOG_INTERVAL_MS);
  }

  async function sync(): Promise<void> {
    if (!running || paused || !shouldAutoConnectTalkButton()) {
      return;
    }
    usePushToTalkStore.getState().enableSerialAutoReconnect();
    await usePushToTalkStore.getState().connectGrantedPorts();
  }

  async function tick(): Promise<void> {
    if (!running || paused || !shouldAutoConnectTalkButton()) {
      return;
    }
    const { serialStatus } = usePushToTalkStore.getState();
    if (serialStatus === "connected" || serialStatus === "connecting") {
      return;
    }
    await sync();
  }

  function pause(): void {
    paused = true;
    void usePushToTalkStore.getState().disconnectSerial();
  }

  function resume(): void {
    paused = false;
    void sync();
  }

  function onPushToTalkChange(event: Event): void {
    const enabled = (event as CustomEvent<PushToTalkChangeDetail>).detail;
    if (enabled) {
      resume();
      return;
    }
    pause();
  }

  function onVisibilityChange(): void {
    if (document.visibilityState !== "visible") return;
    void sync();
  }

  function bindListeners(): void {
    if (listenersBound || typeof window === "undefined") return;
    listenersBound = true;
    window.addEventListener(PUSH_TO_TALK_CHANGE_EVENT, onPushToTalkChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  function unbindListeners(): void {
    if (!listenersBound || typeof window === "undefined") return;
    listenersBound = false;
    window.removeEventListener(PUSH_TO_TALK_CHANGE_EVENT, onPushToTalkChange);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  }

  return {
    start() {
      if (running) return;
      running = true;
      paused = false;
      bindListeners();
      usePushToTalkStore.getState().init();
      startWatchdog();
      void sync();
    },

    stop() {
      running = false;
      paused = false;
      clearWatchdog();
      unbindListeners();
    },

    pause,

    resume,

    sync,
  };
}

export const talkButtonService = createTalkButtonService();
