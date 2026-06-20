import { create } from "zustand";
import { isButtonBridgeAvailable } from "@/button/config";
import { ButtonTransport, type ButtonTransportStatus } from "@/button/transport";
import { getPushToTalk } from "@/settings/councilSettings";
import { isButtonInputEnabled, type ButtonLedMode } from "@/voice/buttonLedMode";

type ButtonStore = {
  pressed: boolean;
  rawPressed: boolean;
  ledMode: ButtonLedMode;
  buttonInputEnabled: boolean;
  bridgeStatus: ButtonTransportStatus;
  bridgeError: string | null;
  keyboardActive: boolean;
  bridgeAvailable: boolean;

  setPressed: (pressed: boolean, source: "keyboard" | "button") => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  enableAutoReconnect: () => void;
  reconnectIfStale: () => Promise<void>;
  setLedMode: (mode: ButtonLedMode) => Promise<void>;
  resyncLed: () => Promise<void>;
  init: () => void;
  dispose: () => void;
};

let buttonTransport: ButtonTransport | null = null;
let keyboardInitialized = false;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function getTransport(
  set: (partial: Partial<ButtonStore>) => void,
  get: () => ButtonStore,
): ButtonTransport {
  if (!buttonTransport) {
    buttonTransport = new ButtonTransport({
      onStatus: (status, error) => {
        const updates: Partial<ButtonStore> = {
          bridgeStatus: status,
          bridgeError: error ?? null,
        };
        if (status === "disconnected" || status === "error") {
          updates.pressed = false;
          updates.rawPressed = false;
          updates.buttonInputEnabled = false;
        }
        if (status === "connected") {
          const { ledMode } = get();
          updates.buttonInputEnabled = isButtonInputEnabled(ledMode);
        }
        set(updates);

        if (status === "connected") {
          void get().resyncLed();
        }
      },
      onLine: (event) => {
        if (event.type === "pong") {
          return;
        }
        if (event.type === "button_down") {
          set({ rawPressed: true });
        } else if (event.type === "button_up") {
          set({ rawPressed: false });
        }
        if (!get().buttonInputEnabled) {
          return;
        }
        if (event.type === "button_down") {
          get().setPressed(true, "button");
        } else if (event.type === "button_up") {
          get().setPressed(false, "button");
        }
      },
    });
  }
  return buttonTransport;
}

function bindKeyboard(set: (partial: Partial<ButtonStore>) => void, get: () => ButtonStore): void {
  if (keyboardInitialized || typeof window === "undefined") return;
  keyboardInitialized = true;

  const onKeyDown = (event: KeyboardEvent) => {
    if (!getPushToTalk()) return;
    if (event.code !== "Space" || event.repeat) return;
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    set({ rawPressed: true });
    if (get().buttonInputEnabled) {
      get().setPressed(true, "keyboard");
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (!getPushToTalk()) return;
    if (event.code !== "Space") return;
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    set({ rawPressed: false });
    if (get().buttonInputEnabled) {
      get().setPressed(false, "keyboard");
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
}

export const useButtonStore = create<ButtonStore>((set, get) => ({
  pressed: false,
  rawPressed: false,
  ledMode: "off",
  buttonInputEnabled: false,
  bridgeStatus: "disconnected",
  bridgeError: null,
  keyboardActive: false,
  bridgeAvailable: isButtonBridgeAvailable(),

  setPressed: (pressed, source) => {
    if (!get().buttonInputEnabled) {
      return;
    }
    set({
      pressed,
      keyboardActive: source === "keyboard" ? pressed : get().keyboardActive,
    });
  },

  connect: async () => {
    await getTransport(set, get).connect();
  },

  disconnect: async () => {
    await getTransport(set, get).disconnect();
  },

  enableAutoReconnect: () => {
    getTransport(set, get).enableAutoReconnect();
  },

  reconnectIfStale: async () => {
    const transport = getTransport(set, get);
    if (get().bridgeStatus === "connected" && !transport.isSessionHealthy()) {
      await transport.connect();
    }
  },

  setLedMode: async (mode) => {
    const inputEnabled = isButtonInputEnabled(mode);
    const updates: Partial<ButtonStore> = {
      ledMode: mode,
      buttonInputEnabled: inputEnabled,
    };
    if (!inputEnabled) {
      updates.pressed = false;
    } else if (get().rawPressed) {
      updates.pressed = true;
    }
    set(updates);

    if (get().bridgeStatus !== "connected") {
      return;
    }
    await getTransport(set, get).setLedMode(mode);
  },

  resyncLed: async () => {
    if (get().bridgeStatus !== "connected") {
      return;
    }
    const { ledMode } = get();
    if (ledMode === "off") {
      return;
    }
    const inputEnabled = isButtonInputEnabled(ledMode);
    set({ buttonInputEnabled: inputEnabled });
    await getTransport(set, get).setLedMode(ledMode);
  },

  init: () => {
    bindKeyboard(set, get);
  },

  dispose: () => {
    set({ pressed: false, rawPressed: false, ledMode: "off", buttonInputEnabled: false });
  },
}));

/** Reset module singletons — for tests only. */
export function _resetButtonStoreForTests(): void {
  buttonTransport = null;
  keyboardInitialized = false;
  useButtonStore.setState({
    pressed: false,
    rawPressed: false,
    ledMode: "off",
    buttonInputEnabled: false,
    bridgeStatus: "disconnected",
    bridgeError: null,
    keyboardActive: false,
    bridgeAvailable: isButtonBridgeAvailable(),
  });
}

/** Dev/e2e hook — read button store state from Playwright. */
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as Window & { __councilButtonStore?: typeof useButtonStore }).__councilButtonStore =
    useButtonStore;
}
