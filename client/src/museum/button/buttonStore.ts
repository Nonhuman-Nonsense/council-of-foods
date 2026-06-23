import { create } from "zustand";
import { isButtonBridgeAvailable } from "./config";
import { ButtonTransport, type ButtonTransportStatus } from "./transport";
import { mergeLedIntents, mergePressOwner, type ButtonOwner } from "./buttonIntent";
import { getPushToTalk } from "@/settings/councilSettings";
import { isButtonInputEnabled, type ButtonLedMode } from "./ledMode";

type ButtonStore = {
  pressed: boolean;
  rawPressed: boolean;
  ledMode: ButtonLedMode;
  buttonIntents: Partial<Record<ButtonOwner, ButtonLedMode>>;
  pressOwner: ButtonOwner | null;
  buttonInputEnabled: boolean;
  bridgeStatus: ButtonTransportStatus;
  bridgeError: string | null;
  serialDeviceConnected: boolean;
  keyboardActive: boolean;
  bridgeAvailable: boolean;

  setPressed: (pressed: boolean, source: "keyboard" | "button") => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  enableAutoReconnect: () => void;
  registerButtonIntent: (owner: ButtonOwner, mode: ButtonLedMode | null) => void;
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
      onSerialDeviceChange: (connected) => {
        set({ serialDeviceConnected: connected });
        if (!connected) {
          set({ pressed: false, rawPressed: false });
          return;
        }
        if (get().bridgeStatus === "connected") {
          void get().resyncLed();
        }
      },
      onLine: (event) => {
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

async function applyLedMode(
  set: (partial: Partial<ButtonStore>) => void,
  get: () => ButtonStore,
  mode: ButtonLedMode,
): Promise<void> {
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
  if (!getTransport(set, get).isSerialDeviceConnected()) {
    return;
  }
  await getTransport(set, get).setLedMode(mode);
}

export const useButtonStore = create<ButtonStore>((set, get) => ({
  pressed: false,
  rawPressed: false,
  ledMode: "off",
  buttonIntents: {},
  pressOwner: null,
  buttonInputEnabled: false,
  bridgeStatus: "disconnected",
  bridgeError: null,
  serialDeviceConnected: false,
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

  registerButtonIntent: (owner, mode) => {
    const nextIntents = { ...get().buttonIntents };
    if (mode === null) {
      delete nextIntents[owner];
    } else {
      nextIntents[owner] = mode;
    }
    const ledMode = mergeLedIntents(nextIntents);
    const pressOwner = mergePressOwner(nextIntents);
    set({ buttonIntents: nextIntents, pressOwner });
    void applyLedMode(set, get, ledMode);
  },

  resyncLed: async () => {
    if (get().bridgeStatus !== "connected") {
      return;
    }
    if (!getTransport(set, get).isSerialDeviceConnected()) {
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
    set({
      pressed: false,
      rawPressed: false,
      ledMode: "off",
      buttonIntents: {},
      pressOwner: null,
      buttonInputEnabled: false,
    });
  },
}));

/** Reset module singletons — for tests only. */
export function _resetButtonStoreForTests(): void {
  void buttonTransport?.disconnect();
  buttonTransport = null;
  keyboardInitialized = false;
  useButtonStore.setState({
    pressed: false,
    rawPressed: false,
    ledMode: "off",
    buttonIntents: {},
    pressOwner: null,
    buttonInputEnabled: false,
    bridgeStatus: "disconnected",
    bridgeError: null,
    serialDeviceConnected: false,
    keyboardActive: false,
    bridgeAvailable: isButtonBridgeAvailable(),
  });
}

/** Dev/e2e hook — read button store state from Playwright. */
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as Window & { __councilButtonStore?: typeof useButtonStore }).__councilButtonStore =
    useButtonStore;
}
