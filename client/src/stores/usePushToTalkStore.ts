import { create } from "zustand";
import { getPushToTalk } from "@/settings/councilSettings";
import {
  isWebSerialSupported,
  SerialPushToTalkTransport,
  type SerialTransportStatus,
} from "@/serial/transport";
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
  serialStatus: SerialTransportStatus;
  serialError: string | null;
  lastSerialLine: string | null;
  keyboardActive: boolean;
  serialSupported: boolean;

  setPressed: (pressed: boolean, source: "keyboard" | "serial") => void;

  requestSerialPort: () => Promise<void>;
  connectGrantedPorts: () => Promise<void>;
  disconnectSerial: () => Promise<void>;
  enableSerialAutoReconnect: () => void;
  setLedMode: (mode: PttLedMode) => Promise<void>;
  resyncSerialLed: () => Promise<void>;

  init: () => void;
  dispose: () => void;
};

let serialTransport: SerialPushToTalkTransport | null = null;
let keyboardInitialized = false;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function getSerialTransport(
  set: (partial: Partial<PushToTalkStore>) => void,
  get: () => PushToTalkStore
): SerialPushToTalkTransport {
  if (!serialTransport) {
    serialTransport = new SerialPushToTalkTransport({
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
        // Track physical state before the pttInputEnabled gate so components
        // can detect a held button even when the LED is off (e.g. pre-warm).
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
  return serialTransport;
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
  serialSupported: isWebSerialSupported(),

  setPressed: (pressed, source) => {
    if (!get().pttInputEnabled) {
      return;
    }
    set({
      pressed,
      keyboardActive: source === "keyboard" ? pressed : get().keyboardActive,
    });
  },

  requestSerialPort: async () => {
    await getSerialTransport(set, get).requestPort();
  },

  connectGrantedPorts: async () => {
    await getSerialTransport(set, get).connectGrantedPorts();
  },

  disconnectSerial: async () => {
    await getSerialTransport(set, get).disconnect();
  },

  enableSerialAutoReconnect: () => {
    getSerialTransport(set, get).enableAutoReconnect();
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
      // Button may already be held while LED was off (e.g. pre-warm connecting).
      updates.pressed = true;
    }
    set(updates);

    if (get().serialStatus !== "connected") {
      return;
    }
    await getSerialTransport(set, get).setLedMode(mode);
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
    await getSerialTransport(set, get).setLedMode(ledMode);
  },

  init: () => {
    bindKeyboard(set, get);
  },

  dispose: () => {
    set({ pressed: false, rawPressed: false, ledMode: "off", pttInputEnabled: false });
  },
}));
