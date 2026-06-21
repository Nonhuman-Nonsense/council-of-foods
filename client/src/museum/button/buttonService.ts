import {
  PUSH_TO_TALK_CHANGE_EVENT,
  type PushToTalkChangeDetail,
} from "@/settings/councilSettings";
import { useButtonStore } from "@stores/useButtonStore";
import { shouldAutoConnectButton } from "./buttonPolicy";

const WATCHDOG_INTERVAL_MS = 2_500;

type ButtonService = {
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  sync: (reason?: string) => Promise<void>;
};

function createButtonService(): ButtonService {
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

  async function runSync(_reason: string): Promise<void> {
    if (!running || paused || !shouldAutoConnectButton()) {
      return;
    }
    useButtonStore.getState().enableAutoReconnect();
    await useButtonStore.getState().connect();
  }

  async function tick(): Promise<void> {
    const { bridgeStatus } = useButtonStore.getState();

    if (!running || paused || !shouldAutoConnectButton()) {
      return;
    }
    if (bridgeStatus === "connected" || bridgeStatus === "connecting") {
      void useButtonStore.getState().reconnectIfStale();
      return;
    }
    await runSync("watchdog");
  }

  function pause(): void {
    paused = true;
    void useButtonStore.getState().disconnect();
  }

  function resume(): void {
    paused = false;
    void runSync("resume");
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
    void runSync("visibility");
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
      useButtonStore.getState().init();
      startWatchdog();
      void runSync("start");
    },

    stop() {
      running = false;
      paused = false;
      clearWatchdog();
      unbindListeners();
    },

    pause,
    resume,
    sync: (reason = "manual") => runSync(reason),
  };
}

export const buttonService = createButtonService();
