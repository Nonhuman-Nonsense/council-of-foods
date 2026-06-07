import { create } from "zustand";
import { getPushToTalk } from "@/settings/councilSettings";
import {
  isWebSerialSupported,
  SerialPushToTalkTransport,
  type SerialTransportStatus,
} from "@/serial/transport";

type PushToTalkStore = {
  pressed: boolean;
  serialStatus: SerialTransportStatus;
  serialError: string | null;
  lastSerialLine: string | null;
  keyboardActive: boolean;
  serialSupported: boolean;

  setPressed: (pressed: boolean, source: "keyboard" | "serial") => void;

  requestSerialPort: () => Promise<void>;
  connectGrantedPorts: () => Promise<void>;
  disconnectSerial: () => Promise<void>;
  setLed: (on: boolean) => Promise<void>;

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
        set({ serialStatus: status, serialError: error ?? null });
      },
      onLine: (event) => {
        if (event.type === "ptt_down") {
          get().setPressed(true, "serial");
          set({ lastSerialLine: "PTT_DOWN" });
        } else if (event.type === "ptt_up") {
          get().setPressed(false, "serial");
          set({ lastSerialLine: "PTT_UP" });
        } else if (event.type === "pong") {
          set({ lastSerialLine: "PONG" });
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
    get().setPressed(true, "keyboard");
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (!getPushToTalk()) return;
    if (event.code !== "Space") return;
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    get().setPressed(false, "keyboard");
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
}

export const usePushToTalkStore = create<PushToTalkStore>((set, get) => ({
  pressed: false,
  serialStatus: "disconnected",
  serialError: null,
  lastSerialLine: null,
  keyboardActive: false,
  serialSupported: isWebSerialSupported(),

  setPressed: (pressed, source) => {
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

  setLed: async (on) => {
    if (get().serialStatus !== "connected") return;
    await getSerialTransport(set, get).setLed(on);
  },

  init: () => {
    bindKeyboard(set, get);
    if (getPushToTalk()) {
      void get().connectGrantedPorts();
    }
  },

  dispose: () => {
    void getSerialTransport(set, get).disconnect();
    set({ pressed: false });
  },
}));
