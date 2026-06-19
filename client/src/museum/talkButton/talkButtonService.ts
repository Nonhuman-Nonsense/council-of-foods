import {
  PUSH_TO_TALK_CHANGE_EVENT,
  type PushToTalkChangeDetail,
} from "@/settings/councilSettings";
import { serialDebugLog } from "@/serial/debugLog";
import { usePushToTalkStore } from "@stores/usePushToTalkStore";
import { shouldAutoConnectTalkButton } from "./talkButtonPolicy";

const WATCHDOG_INTERVAL_MS = 2_500;

export type TalkButtonServiceDebugState = {
  running: boolean;
  paused: boolean;
  watchdogActive: boolean;
  shouldAutoConnect: boolean;
};

type TalkButtonService = {
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  sync: (reason?: string) => Promise<void>;
  getDebugState: () => TalkButtonServiceDebugState;
};

function createTalkButtonService(): TalkButtonService {
  let running = false;
  let paused = false;
  let watchdogTimer: ReturnType<typeof setInterval> | null = null;
  let listenersBound = false;

  function getDebugState(): TalkButtonServiceDebugState {
    return {
      running,
      paused,
      watchdogActive: watchdogTimer != null,
      shouldAutoConnect: shouldAutoConnectTalkButton(),
    };
  }

  function clearWatchdog(): void {
    if (watchdogTimer) {
      clearInterval(watchdogTimer);
      watchdogTimer = null;
      serialDebugLog("service", "watchdog stopped");
    }
  }

  function startWatchdog(): void {
    if (watchdogTimer) return;
    watchdogTimer = setInterval(() => {
      void tick();
    }, WATCHDOG_INTERVAL_MS);
    serialDebugLog("service", "watchdog started", { intervalMs: WATCHDOG_INTERVAL_MS });
  }

  async function runSync(reason: string): Promise<void> {
    const debug = getDebugState();
    serialDebugLog("service", `sync (${reason})`, debug);

    if (!running || paused || !shouldAutoConnectTalkButton()) {
      serialDebugLog("service", `sync skipped (${reason})`, debug, "warn");
      return;
    }
    usePushToTalkStore.getState().enableSerialAutoReconnect();
    await usePushToTalkStore.getState().connectGrantedPorts();
  }

  async function tick(): Promise<void> {
    const { serialStatus } = usePushToTalkStore.getState();
    serialDebugLog("service", "watchdog tick", {
      ...getDebugState(),
      serialStatus,
    });

    if (!running || paused || !shouldAutoConnectTalkButton()) {
      return;
    }
    if (serialStatus === "connected" || serialStatus === "connecting") {
      return;
    }
    await runSync("watchdog");
  }

  function pause(): void {
    paused = true;
    serialDebugLog("service", "paused (staff disconnect or PTT off)");
    void usePushToTalkStore.getState().disconnectSerial();
  }

  function resume(): void {
    paused = false;
    serialDebugLog("service", "resumed");
    void runSync("resume");
  }

  function onPushToTalkChange(event: Event): void {
    const enabled = (event as CustomEvent<PushToTalkChangeDetail>).detail;
    serialDebugLog("service", "push-to-talk setting changed", { enabled });
    if (enabled) {
      resume();
      return;
    }
    pause();
  }

  function onVisibilityChange(): void {
    serialDebugLog("service", "visibility changed", {
      visibilityState: document.visibilityState,
    });
    if (document.visibilityState !== "visible") return;
    void runSync("visibility");
  }

  function bindListeners(): void {
    if (listenersBound || typeof window === "undefined") return;
    listenersBound = true;
    window.addEventListener(PUSH_TO_TALK_CHANGE_EVENT, onPushToTalkChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    serialDebugLog("service", "event listeners bound");
  }

  function unbindListeners(): void {
    if (!listenersBound || typeof window === "undefined") return;
    listenersBound = false;
    window.removeEventListener(PUSH_TO_TALK_CHANGE_EVENT, onPushToTalkChange);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    serialDebugLog("service", "event listeners unbound");
  }

  return {
    start() {
      if (running) {
        serialDebugLog("service", "start ignored (already running)", undefined, "warn");
        return;
      }
      running = true;
      paused = false;
      serialDebugLog("service", "started", {
        pushToTalk: shouldAutoConnectTalkButton(),
        href: typeof window !== "undefined" ? window.location.href : "",
      });
      bindListeners();
      usePushToTalkStore.getState().init();
      startWatchdog();
      void runSync("start");
    },

    stop() {
      serialDebugLog("service", "stopped");
      running = false;
      paused = false;
      clearWatchdog();
      unbindListeners();
    },

    pause,

    resume,

    sync: (reason = "manual") => runSync(reason),

    getDebugState,
  };
}

export const talkButtonService = createTalkButtonService();
