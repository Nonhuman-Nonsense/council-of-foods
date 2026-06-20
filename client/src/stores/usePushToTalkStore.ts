import { create } from "zustand";
import { serialDebugLog } from "@/serial/debugLog";
import { isBridgeTransportAvailable } from "@/serial/bridgeConfig";
import {
  BridgePttTransport,
  type PttTransportStatus,
} from "@/serial/bridgeTransport";
import { getPushToTalk } from "@/settings/councilSettings";
import { isPttInputEnabled, type PttLedMode } from "@/voice/pttLedMode";

type PushToTalkStore = {
  /**
   * Logical press: true only when pttInputEnabled is also true.
   * Guards accidental activation — use rawPressed when you need the
   * physical state regardless of LED gating.
   */
  pressed: boolean;
  /**
   * Physical button state, updated by every ptt_down / ptt_up or space key
   * event before any pttInputEnabled check. Use this when you need to know
   * whether the button is currently held even if the LED is off (e.g. to
   * auto-start recording the moment a pre-warm connection becomes ready).
   */
  rawPressed: boolean;
  ledMode: PttLedMode;
  pttInputEnabled: boolean;
  serialStatus: PttTransportStatus;
  serialError: string | null;
  lastSerialLine: string | null;
  keyboardActive: boolean;
  serialSupported: boolean;

  setPressed: (pressed: boolean, source: "keyboard" | "serial") => void;

  connectGrantedPorts: () => Promise<void>;
  disconnectSerial: () => Promise<void>;
  enableSerialAutoReconnect: () => void;
  reconnectIfStale: () => Promise<void>;
  setLedMode: (mode: PttLedMode) => Promise<void>;
  resyncSerialLed: () => Promise<void>;

  init: () => void;
  dispose: () => void;
};

let pttTransport: BridgePttTransport | null = null;
let keyboardInitialized = false;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function getPttTransport(
  set: (partial: Partial<PushToTalkStore>) => void,
  get: () => PushToTalkStore
): BridgePttTransport {
  if (!pttTransport) {
    pttTransport = new BridgePttTransport({
      onStatus: (status, error) => {
        const updates: Partial<PushToTalkStore> = {
          serialStatus: status,
          serialError: error ?? null,
        };
        if (status === "disconnected" || status === "error") {
          updates.pressed = false;
          updates.rawPressed = false;
          updates.pttInputEnabled = false;
        }
        if (status === "connected") {
          const { ledMode } = get();
          updates.pttInputEnabled = isPttInputEnabled(ledMode);
        }
        set(updates);

        if (status === "connected") {
          void get().resyncSerialLed();
        }
      },
      onLine: (event) => {
        if (event.type === "pong") {
          set({ lastSerialLine: "PONG" });
          return;
        }
        if (event.type === "ptt_down") {
          set({ rawPressed: true });
        } else if (event.type === "ptt_up") {
          set({ rawPressed: false });
        }
        if (!get().pttInputEnabled) {
          return;
        }
        if (event.type === "ptt_down") {
          get().setPressed(true, "serial");
          set({ lastSerialLine: "PTT_DOWN" });
        } else if (event.type === "ptt_up") {
          get().setPressed(false, "serial");
          set({ lastSerialLine: "PTT_UP" });
        }
      },
      onRawLine: (line) => {
        set({ lastSerialLine: line });
      },
    });
  }
  return pttTransport;
}

function bindKeyboard(set: (partial: Partial<PushToTalkStore>) => void, get: () => PushToTalkStore): void {
  if (keyboardInitialized || typeof window === "undefined") return;
  keyboardInitialized = true;

  const onKeyDown = (event: KeyboardEvent) => {
    if (!getPushToTalk()) return;
    if (event.code !== "Space" || event.repeat) return;
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    set({ rawPressed: true });
    if (get().pttInputEnabled) {
      get().setPressed(true, "keyboard");
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (!getPushToTalk()) return;
    if (event.code !== "Space") return;
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    set({ rawPressed: false });
    if (get().pttInputEnabled) {
      get().setPressed(false, "keyboard");
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
}

export const usePushToTalkStore = create<PushToTalkStore>((set, get) => ({
  pressed: false,
  rawPressed: false,
  ledMode: "off",
  pttInputEnabled: false,
  serialStatus: "disconnected",
  serialError: null,
  lastSerialLine: null,
  keyboardActive: false,
  serialSupported: isBridgeTransportAvailable(),

  setPressed: (pressed, source) => {
    if (!get().pttInputEnabled) {
      return;
    }
    set({
      pressed,
      keyboardActive: source === "keyboard" ? pressed : get().keyboardActive,
    });
  },

  connectGrantedPorts: async () => {
    await getPttTransport(set, get).connect();
  },

  disconnectSerial: async () => {
    await getPttTransport(set, get).disconnect();
  },

  enableSerialAutoReconnect: () => {
    getPttTransport(set, get).enableAutoReconnect();
  },

  reconnectIfStale: async () => {
    const transport = getPttTransport(set, get);
    if (get().serialStatus === "connected" && !transport.isSessionHealthy()) {
      serialDebugLog("store", "stale bridge session — requesting reconnect");
      await transport.connect();
    }
  },

  setLedMode: async (mode) => {
    const inputEnabled = isPttInputEnabled(mode);
    const updates: Partial<PushToTalkStore> = {
      ledMode: mode,
      pttInputEnabled: inputEnabled,
    };
    if (!inputEnabled) {
      updates.pressed = false;
    } else if (get().rawPressed) {
      updates.pressed = true;
    }
    set(updates);

    if (get().serialStatus !== "connected") {
      return;
    }
    await getPttTransport(set, get).setLedMode(mode);
  },

  resyncSerialLed: async () => {
    if (get().serialStatus !== "connected") {
      return;
    }
    const { ledMode } = get();
    if (ledMode === "off") {
      return;
    }
    const inputEnabled = isPttInputEnabled(ledMode);
    set({ pttInputEnabled: inputEnabled });
    await getPttTransport(set, get).setLedMode(ledMode);
  },

  init: () => {
    bindKeyboard(set, get);
  },

  dispose: () => {
    set({ pressed: false, rawPressed: false, ledMode: "off", pttInputEnabled: false });
  },
}));
