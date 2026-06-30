import { create } from "zustand";
import {
  ButtonTransport,
  isButtonBridgeAvailable,
  type ButtonTransportStatus,
} from "./buttonBridge";
import { getAgentMode } from "@/settings/councilSettings";
import { log } from "@/logger";

export type ButtonLedMode = "off" | "pulse" | "on";
export type ButtonOwner = "setup" | "autoplay" | "voice-guide" | "human-input" | "meta-agent" | "summary";

export type ButtonClaims = Partial<Record<ButtonOwner, true>>;
export type ButtonLedModes = Partial<Record<ButtonOwner, ButtonLedMode>>;
export type ButtonBannerVisible = Partial<Record<ButtonOwner, boolean>>;
export type ButtonBannerMessageKeys = Partial<Record<ButtonOwner, string>>;

/** Setup is highest: staff diagnostics overlay mounted on top of the running app. */
const BUTTON_OWNER_PRIORITY: Record<ButtonOwner, number> = {
  setup: 4,
  autoplay: 3,
  "human-input": 2,
  summary: 2,
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

/** Global ButtonBanner follows the routed owner's visibility flag. */
export function resolveActiveButtonBanner(
  buttonOwner: ButtonOwner | null,
  bannerVisible: ButtonBannerVisible,
): boolean {
  if (!buttonOwner) {
    return false;
  }
  return bannerVisible[buttonOwner] === true;
}

type ButtonStore = {
  pressed: boolean;
  /** When true, held input is ignored until all keys/buttons release (owner handoff). */
  ignoreDownUntilRelease: boolean;
  keyboardDown: boolean;
  hardwareDown: boolean;
  ledMode: ButtonLedMode;
  claims: ButtonClaims;
  ledModes: ButtonLedModes;
  buttonOwner: ButtonOwner | null;
  bannerVisible: ButtonBannerVisible;
  bannerMessageKeys: ButtonBannerMessageKeys;
  activeButtonBanner: boolean;
  bridgeStatus: ButtonTransportStatus;
  bridgeError: string | null;
  serialDeviceConnected: boolean;
  keyboardActive: boolean;
  bridgeAvailable: boolean;

  syncPressed: (source?: "keyboard" | "button") => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  enableAutoReconnect: () => void;
  claimButton: (owner: ButtonOwner) => void;
  releaseButton: (owner: ButtonOwner) => void;
  setButtonLed: (owner: ButtonOwner, mode: ButtonLedMode) => void;
  setButtonBannerVisible: (owner: ButtonOwner, visible: boolean) => void;
  setButtonBannerMessageKey: (owner: ButtonOwner, messageKey: string | undefined) => void;
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

function recomputePressed(
  set: (partial: Partial<ButtonStore> | ((state: ButtonStore) => Partial<ButtonStore>)) => void,
  get: () => ButtonStore,
  source?: "keyboard" | "button",
): void {
  const {
    ledMode,
    keyboardDown,
    hardwareDown,
    pressed: prevPressed,
    ignoreDownUntilRelease,
  } = get();
  const inputDown = keyboardDown || hardwareDown;
  const ignore = inputDown ? ignoreDownUntilRelease : false;
  const pressed = !ignore && ledMode !== "off" && inputDown;

  if (prevPressed !== pressed && source) {
    log.event("BUTTON", pressed ? "press" : "release", {
      source,
      owner: get().buttonOwner,
    });
  }

  const updates: Partial<ButtonStore> = { pressed, ignoreDownUntilRelease: ignore };
  if (source === "keyboard") {
    updates.keyboardActive = pressed && keyboardDown;
  }
  set(updates);
}

function getTransport(
  set: (partial: Partial<ButtonStore> | ((state: ButtonStore) => Partial<ButtonStore>)) => void,
  get: () => ButtonStore,
): ButtonTransport {
  if (!buttonTransport) {
    buttonTransport = new ButtonTransport({
      onStatus: (status, error) => {
        set({
          bridgeStatus: status,
          bridgeError: error ?? null,
        });

        if (status === "disconnected" || status === "error") {
          set({ hardwareDown: false });
          recomputePressed(set, get);
        }

        if (status === "connected") {
          void get().resyncLed();
        }
      },
      onSerialDeviceChange: (connected) => {
        set({ serialDeviceConnected: connected });
        if (!connected) {
          set({ hardwareDown: false });
          recomputePressed(set, get);
          return;
        }
        if (get().bridgeStatus === "connected") {
          void get().resyncLed();
        }
      },
      onLine: (event) => {
        if (event.type === "button_down") {
          set({ hardwareDown: true });
          recomputePressed(set, get, "button");
        } else if (event.type === "button_up") {
          set({ hardwareDown: false });
          recomputePressed(set, get, "button");
        }
      },
    });
  }
  return buttonTransport;
}

function bindKeyboard(
  set: (partial: Partial<ButtonStore> | ((state: ButtonStore) => Partial<ButtonStore>)) => void,
  get: () => ButtonStore,
): void {
  if (keyboardInitialized || typeof window === "undefined") return;
  keyboardInitialized = true;

  const onKeyDown = (event: KeyboardEvent) => {
    if (getAgentMode() !== "ptt") return;
    if (event.code !== "Space" || event.repeat) return;
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    set({ keyboardDown: true });
    recomputePressed(set, get, "keyboard");
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (getAgentMode() !== "ptt") return;
    if (event.code !== "Space") return;
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    set({ keyboardDown: false });
    recomputePressed(set, get, "keyboard");
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
}

async function applyLedMode(
  set: (partial: Partial<ButtonStore> | ((state: ButtonStore) => Partial<ButtonStore>)) => void,
  get: () => ButtonStore,
  mode: ButtonLedMode,
): Promise<void> {
  set({ ledMode: mode });
  recomputePressed(set, get);

  if (get().bridgeStatus !== "connected") {
    return;
  }
  if (!getTransport(set, get).isSerialDeviceConnected()) {
    return;
  }
  await getTransport(set, get).setLedMode(mode);
}

function recomputeButtonRouting(
  set: (partial: Partial<ButtonStore> | ((state: ButtonStore) => Partial<ButtonStore>)) => void,
  get: () => ButtonStore,
  claims: ButtonClaims,
  ledModes: ButtonLedModes,
): void {
  const prevOwner = get().buttonOwner;
  const buttonOwner = mergeButtonOwner(claims);
  const ledMode = resolveAppliedLedMode(ledModes, buttonOwner);
  const { keyboardDown, hardwareDown } = get();
  const inputDown = keyboardDown || hardwareDown;
  let ignoreDownUntilRelease = get().ignoreDownUntilRelease;
  if (prevOwner !== buttonOwner) {
    log.event("BUTTON", "owner change", { from: prevOwner, to: buttonOwner });
    if (prevOwner != null && inputDown) {
      ignoreDownUntilRelease = true;
      log.event("BUTTON", "suppress carryover", { from: prevOwner, to: buttonOwner });
    } else if (!inputDown) {
      ignoreDownUntilRelease = false;
    }
  }
  set({ claims, ledModes, buttonOwner, ignoreDownUntilRelease });
  void applyLedMode(set, get, ledMode);
  set({
    activeButtonBanner: resolveActiveButtonBanner(
      buttonOwner,
      get().bannerVisible,
    ),
  });
}

function setBannerMessageKeyForOwner(
  set: (partial: Partial<ButtonStore> | ((state: ButtonStore) => Partial<ButtonStore>)) => void,
  get: () => ButtonStore,
  owner: ButtonOwner,
  messageKey: string | undefined,
): void {
  const bannerMessageKeys = { ...get().bannerMessageKeys };
  if (messageKey) {
    bannerMessageKeys[owner] = messageKey;
  } else {
    delete bannerMessageKeys[owner];
  }
  set({ bannerMessageKeys });
}

function setBannerVisibleForOwner(
  set: (partial: Partial<ButtonStore> | ((state: ButtonStore) => Partial<ButtonStore>)) => void,
  get: () => ButtonStore,
  owner: ButtonOwner,
  visible: boolean,
): void {
  const bannerVisible = { ...get().bannerVisible };
  if (visible) {
    bannerVisible[owner] = true;
  } else {
    delete bannerVisible[owner];
  }
  set({
    bannerVisible,
    activeButtonBanner: resolveActiveButtonBanner(get().buttonOwner, bannerVisible),
  });
}

export const useButtonStore = create<ButtonStore>((set, get) => ({
  pressed: false,
  ignoreDownUntilRelease: false,
  keyboardDown: false,
  hardwareDown: false,
  ledMode: "off",
  claims: {},
  ledModes: {},
  buttonOwner: null,
  bannerVisible: {},
  bannerMessageKeys: {},
  activeButtonBanner: false,
  bridgeStatus: "disconnected",
  bridgeError: null,
  serialDeviceConnected: false,
  keyboardActive: false,
  bridgeAvailable: isButtonBridgeAvailable(),

  syncPressed: (source) => {
    recomputePressed(set, get, source);
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
    const bannerVisible = { ...get().bannerVisible };
    delete bannerVisible[owner];
    const bannerMessageKeys = { ...get().bannerMessageKeys };
    delete bannerMessageKeys[owner];
    set({ bannerVisible, bannerMessageKeys });
    recomputeButtonRouting(set, get, claims, ledModes);
  },

  setButtonBannerVisible: (owner, visible) => {
    setBannerVisibleForOwner(set, get, owner, visible);
  },

  setButtonBannerMessageKey: (owner, messageKey) => {
    setBannerMessageKeyForOwner(set, get, owner, messageKey);
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
    const { ledMode } = get();
    await getTransport(set, get).setLedMode(ledMode);
  },

  init: () => {
    bindKeyboard(set, get);
  },

  dispose: () => {
    set({
      pressed: false,
      ignoreDownUntilRelease: false,
      keyboardDown: false,
      hardwareDown: false,
      ledMode: "off",
      claims: {},
      ledModes: {},
      buttonOwner: null,
      bannerVisible: {},
      bannerMessageKeys: {},
      activeButtonBanner: false,
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
    ignoreDownUntilRelease: false,
    keyboardDown: false,
    hardwareDown: false,
    ledMode: "off",
    claims: {},
    ledModes: {},
    buttonOwner: null,
    bannerVisible: {},
    bannerMessageKeys: {},
    activeButtonBanner: false,
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
