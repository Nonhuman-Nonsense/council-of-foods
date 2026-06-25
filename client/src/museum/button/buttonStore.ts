import { create } from "zustand";
import {
  ButtonTransport,
  isButtonBridgeAvailable,
  type ButtonTransportStatus,
} from "./buttonBridge";
import { getPushToTalk } from "@/settings/councilSettings";
import { log } from "@/logger";

export type ButtonLedMode = "off" | "pulse" | "on";
export type ButtonOwner = "setup" | "voice-guide" | "human-input" | "meta-agent";

export type ButtonClaims = Partial<Record<ButtonOwner, true>>;
export type ButtonLedModes = Partial<Record<ButtonOwner, ButtonLedMode>>;

/** Setup is highest: staff diagnostics overlay mounted on top of the running app. */
const BUTTON_OWNER_PRIORITY: Record<ButtonOwner, number> = {
  setup: 3,
  "human-input": 2,
  "voice-guide": 1,
  "meta-agent": 1,
};

/** Highest-priority owner with an active claim wins button routing. */
export function mergeButtonOwner(claims: ButtonClaims): ButtonOwner | null {
  let winner: ButtonOwner | null = null;
  let winnerPriority = -1;

  for (const owner of Object.keys(claims) as ButtonOwner[]) {
    if (!claims[owner]) {
      continue;
    }
    const priority = BUTTON_OWNER_PRIORITY[owner];
    if (priority > winnerPriority) {
      winner = owner;
      winnerPriority = priority;
    }
  }

  return winner;
}

/** Hardware LED follows the current buttonOwner's LED preference. */
export function resolveAppliedLedMode(
  ledModes: ButtonLedModes,
  buttonOwner: ButtonOwner | null,
): ButtonLedMode {
  return buttonOwner ? (ledModes[buttonOwner] ?? "off") : "off";
}

type ButtonStore = {
  pressed: boolean;
  rawPressed: boolean;
  ledMode: ButtonLedMode;
  claims: ButtonClaims;
  ledModes: ButtonLedModes;
  buttonOwner: ButtonOwner | null;
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
  claimButton: (owner: ButtonOwner) => void;
  releaseButton: (owner: ButtonOwner) => void;
  setButtonLed: (owner: ButtonOwner, mode: ButtonLedMode) => void;
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
          updates.buttonInputEnabled = get().buttonOwner !== null;
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
  const buttonInputEnabled = get().buttonOwner !== null;
  const updates: Partial<ButtonStore> = {
    ledMode: mode,
    buttonInputEnabled,
  };
  if (!buttonInputEnabled) {
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

function recomputeButtonRouting(
  set: (partial: Partial<ButtonStore>) => void,
  get: () => ButtonStore,
  claims: ButtonClaims,
  ledModes: ButtonLedModes,
): void {
  const prevOwner = get().buttonOwner;
  const buttonOwner = mergeButtonOwner(claims);
  const ledMode = resolveAppliedLedMode(ledModes, buttonOwner);
  if (prevOwner !== buttonOwner) {
    log.event("BUTTON", "owner change", { from: prevOwner, to: buttonOwner });
  }
  set({ claims, ledModes, buttonOwner });
  void applyLedMode(set, get, ledMode);
}

export const useButtonStore = create<ButtonStore>((set, get) => ({
  pressed: false,
  rawPressed: false,
  ledMode: "off",
  claims: {},
  ledModes: {},
  buttonOwner: null,
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
    const prev = get().pressed;
    if (prev !== pressed) {
      log.event("BUTTON", pressed ? "press" : "release", {
        source,
        owner: get().buttonOwner,
      });
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

  claimButton: (owner) => {
    log.event("BUTTON", "claim", { owner });
    const claims = { ...get().claims, [owner]: true as const };
    recomputeButtonRouting(set, get, claims, get().ledModes);
  },

  releaseButton: (owner) => {
    log.event("BUTTON", "release claim", { owner });
    const claims = { ...get().claims };
    delete claims[owner];
    const ledModes = { ...get().ledModes };
    delete ledModes[owner];
    recomputeButtonRouting(set, get, claims, ledModes);
  },

  setButtonLed: (owner, mode) => {
    const ledModes = { ...get().ledModes, [owner]: mode };
    if (get().buttonOwner === owner) {
      recomputeButtonRouting(set, get, get().claims, ledModes);
      return;
    }
    set({ ledModes });
  },

  resyncLed: async () => {
    if (get().bridgeStatus !== "connected") {
      return;
    }
    if (!getTransport(set, get).isSerialDeviceConnected()) {
      return;
    }
    const { ledMode, buttonOwner } = get();
    set({ buttonInputEnabled: buttonOwner !== null });
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
      claims: {},
      ledModes: {},
      buttonOwner: null,
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
    claims: {},
    ledModes: {},
    buttonOwner: null,
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
