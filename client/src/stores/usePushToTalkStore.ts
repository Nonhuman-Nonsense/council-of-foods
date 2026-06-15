import { create } from "zustand";
import { getPushToTalk } from "@/settings/councilSettings";
import {
  isWebSerialSupported,
  SerialPushToTalkTransport,
  type SerialTransportStatus,
} from "@/serial/transport";
import { isPttInputEnabled, type PttLedMode } from "@/voice/pttLedMode";

type PushToTalkStore = {
  pressed: boolean;
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
  setLedMode: (mode: PttLedMode) => Promise<void>;
  resyncSerialLed: () => Promise<void>;

  init: () => void;
  dispose: () => void;
};

let serialTransport: SerialPushToTalkTransport | null = null;
let keyboardInitialized = false;
let visibilityListenerInitialized = false;

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
    if (!get().pttInputEnabled) return;
    if (event.code !== "Space" || event.repeat) return;
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    get().setPressed(true, "keyboard");
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (!getPushToTalk()) return;
    if (!get().pttInputEnabled) return;
    if (event.code !== "Space") return;
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    get().setPressed(false, "keyboard");
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
}

function bindVisibilityReconnect(get: () => PushToTalkStore): void {
  if (visibilityListenerInitialized || typeof document === "undefined") return;
  visibilityListenerInitialized = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !getPushToTalk()) return;
    void get().connectGrantedPorts();
  });
}

export const usePushToTalkStore = create<PushToTalkStore>((set, get) => ({
  pressed: false,
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

  setLedMode: async (mode) => {
    const inputEnabled = isPttInputEnabled(mode);
    const updates: Partial<PushToTalkStore> = {
      ledMode: mode,
      pttInputEnabled: inputEnabled,
    };
    if (!inputEnabled) {
      updates.pressed = false;
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
    bindVisibilityReconnect(get);
    if (getPushToTalk()) {
      void get().connectGrantedPorts();
    }
  },

  dispose: () => {
    void getSerialTransport(set, get).disconnect();
    set({ pressed: false, ledMode: "off", pttInputEnabled: false });
  },
}));
