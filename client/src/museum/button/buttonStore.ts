import { create } from "zustand";
import {
  ButtonTransport,
  isButtonBridgeAvailable,
  type ButtonTransportStatus,
} from "./buttonBridge";
import { log } from "@/logger";
import type { TranslationKey } from "@/i18n";

/**
 * A press shorter than this is a click, not a hold: too short to have said anything, so
 * the visitor most likely does not know the button has to be held. See `shortPressAt`.
 */
export const SHORT_PRESS_MS = 300;

export type ButtonLedMode = "off" | "pulse" | "on";

export type ButtonOwner = "staff" | "autoplay" | "setup-agent" | "human-input" | "meta-agent" | "summary" | "replay";

export type ButtonClaims = Partial<Record<ButtonOwner, true>>;
export type ButtonArmed = Partial<Record<ButtonOwner, true>>;
export type ButtonBannerVisible = Partial<Record<ButtonOwner, boolean>>;
export type ButtonBannerMessageKeys = Partial<Record<ButtonOwner, TranslationKey>>;

export type BannerContent =
  | { kind: "message"; messageKey: TranslationKey }
  | {
      kind: "replay";
      meetingId: number;
      meetingTitle: string;
      meetingDate: string;
      isPaused: boolean;
    };

export type ButtonBannerContent = Partial<Record<ButtonOwner, BannerContent>>;

/** Staff is highest: staff diagnostics overlay mounted on top of the running app. */
const BUTTON_OWNER_PRIORITY: Record<ButtonOwner, number> = {
  staff: 4,
  autoplay: 3,
  "human-input": 2,
  summary: 2,
  replay: 1,
  "setup-agent": 1,
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

/** The button responds to input only while its routed owner has armed it. */
export function resolveAppliedArmed(
  armedOwners: ButtonArmed,
  buttonOwner: ButtonOwner | null,
): boolean {
  return buttonOwner ? armedOwners[buttonOwner] === true : false;
}

/**
 * The hardware LED is pure display, derived from the state the store already
 * knows — owners arm the button and never speak of lights. Dark when the button
 * would ignore a press, solid while it is taking the visitor's voice, pulsing
 * to invite one.
 */
export function resolveLedMode(armed: boolean, wantsMic: boolean): ButtonLedMode {
  if (!armed) return "off";
  return wantsMic ? "on" : "pulse";
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
  /**
   * When the last press too short to be a hold was let go (`Date.now()`), so the
   * on-screen mic can say the button has to be held. Null until one happens.
   */
  shortPressAt: number | null;
  /**
   * When true, held input is ignored until all keys/buttons release — an owner handoff,
   * or an owner ending the press itself (`endPress`).
   */
  ignoreDownUntilRelease: boolean;
  keyboardDown: boolean;
  hardwareDown: boolean;
  /** The on-screen mic button is held (web) — the same gesture as space or the hardware button. */
  screenDown: boolean;
  /** The routed owner has armed the button — the gate every press passes. */
  armed: boolean;
  /** Derived display only; nothing gates on this. See {@link resolveLedMode}. */
  ledMode: ButtonLedMode;
  claims: ButtonClaims;
  armedOwners: ButtonArmed;
  buttonOwner: ButtonOwner | null;
  bannerVisible: ButtonBannerVisible;
  bannerMessageKeys: ButtonBannerMessageKeys;
  bannerContent: ButtonBannerContent;
  activeButtonBanner: boolean;
  bridgeStatus: ButtonTransportStatus;
  bridgeError: string | null;
  serialDeviceConnected: boolean;
  keyboardActive: boolean;
  bridgeAvailable: boolean;

  syncPressed: (source?: PressSource) => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  enableAutoReconnect: () => void;
  claimButton: (owner: ButtonOwner) => void;
  releaseButton: (owner: ButtonOwner) => void;
  setButtonArmed: (owner: ButtonOwner, armed: boolean) => void;
  setButtonScreenDown: (owner: ButtonOwner, down: boolean) => void;
  endButtonPress: (owner: ButtonOwner) => void;
  setButtonBannerVisible: (owner: ButtonOwner, visible: boolean) => void;
  setButtonBannerMessageKey: (owner: ButtonOwner, messageKey: TranslationKey | undefined) => void;
  setButtonBannerContent: (owner: ButtonOwner, content: BannerContent | undefined) => void;
  resyncLed: () => Promise<void>;
  init: () => void;
  dispose: () => void;
};

let buttonTransport: ButtonTransport | null = null;
let keyboardInitialized = false;
/** Where a press came from: the space bar, the hardware button, or the on-screen mic. */
type PressSource = "keyboard" | "button" | "screen";

/** When the current press began; not reactive, so a module var. */
let pressStartedAt: number | null = null;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function recomputePressed(
  set: (partial: Partial<ButtonStore> | ((state: ButtonStore) => Partial<ButtonStore>)) => void,
  get: () => ButtonStore,
  source?: PressSource,
): void {
  const {
    armed,
    keyboardDown,
    hardwareDown,
    screenDown,
    pressed: prevPressed,
    ledMode: prevLedMode,
    ignoreDownUntilRelease,
  } = get();
  const inputDown = keyboardDown || hardwareDown || screenDown;
  const ignore = inputDown ? ignoreDownUntilRelease : false;
  const pressed = !ignore && armed && inputDown;

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

  if (!prevPressed && pressed) {
    pressStartedAt = Date.now();
  } else if (prevPressed && !pressed) {
    // Only a release the visitor made: a disarm, a handoff or `endPress` is not a click.
    if (source && pressStartedAt != null && Date.now() - pressStartedAt < SHORT_PRESS_MS) {
      updates.shortPressAt = Date.now();
    }
    pressStartedAt = null;
  }

  const ledMode = resolveLedMode(armed, pressed);
  updates.ledMode = ledMode;
  set(updates);

  if (ledMode !== prevLedMode) {
    void pushLedToHardware(set, get, ledMode);
  }
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
          // A connection drop is not a gesture, and its release is not a click.
          pressStartedAt = null;
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
          pressStartedAt = null;
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

  // No mode gate: an owner only counts as armed once it sets a non-"off" LED
  // mode (see recomputePressed), so a mode with nothing claiming the button
  // never sees a press regardless.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code !== "Space" || event.repeat) return;
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    set({ keyboardDown: true });
    recomputePressed(set, get, "keyboard");
  };

  const onKeyUp = (event: KeyboardEvent) => {
    if (event.code !== "Space") return;
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    set({ keyboardDown: false });
    recomputePressed(set, get, "keyboard");
  };

  // A keyup can be lost while the window is not focused — most sharply on the
  // very first web press, where the microphone permission prompt can take focus
  // mid-hold and the mic would otherwise stay open with nothing holding it.
  // Treat losing focus as a release — of the on-screen button too, whose pointer
  // release can be lost the same way.
  const onBlur = () => {
    if (get().keyboardDown || get().screenDown) {
      set({ keyboardDown: false, screenDown: false });
      recomputePressed(set, get, "keyboard");
    }
  };

  // The on-screen button reports its own release, but it can be swapped out from under a
  // held pointer (for a spinner while the agent connects) and an unmounted button reports
  // nothing. Any pointer let go anywhere ends its hold.
  const onPointerUp = () => {
    if (get().screenDown) {
      set({ screenDown: false });
      recomputePressed(set, get, "screen");
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
}

async function pushLedToHardware(
  set: (partial: Partial<ButtonStore> | ((state: ButtonStore) => Partial<ButtonStore>)) => void,
  get: () => ButtonStore,
  mode: ButtonLedMode,
): Promise<void> {
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
  armedOwners: ButtonArmed,
): void {
  const prevOwner = get().buttonOwner;
  const buttonOwner = mergeButtonOwner(claims);
  const armed = resolveAppliedArmed(armedOwners, buttonOwner);
  const { keyboardDown, hardwareDown, screenDown } = get();
  const inputDown = keyboardDown || hardwareDown || screenDown;
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

  // Neither a disarm nor a handoff is a gesture, so the release each one
  // causes must not be measured as a click.
  if (prevOwner !== buttonOwner || !armed) {
    pressStartedAt = null;
  }

  set({ claims, armedOwners, buttonOwner, armed, ignoreDownUntilRelease });
  recomputePressed(set, get);
  set({
    activeButtonBanner: resolveActiveButtonBanner(
      buttonOwner,
      get().bannerVisible,
    ),
  });
}

function setBannerContentForOwner(
  set: (partial: Partial<ButtonStore> | ((state: ButtonStore) => Partial<ButtonStore>)) => void,
  get: () => ButtonStore,
  owner: ButtonOwner,
  content: BannerContent | undefined,
): void {
  const bannerContent = { ...get().bannerContent };
  if (content) {
    bannerContent[owner] = content;
  } else {
    delete bannerContent[owner];
  }
  set({ bannerContent });
}

function setBannerMessageKeyForOwner(
  set: (partial: Partial<ButtonStore> | ((state: ButtonStore) => Partial<ButtonStore>)) => void,
  get: () => ButtonStore,
  owner: ButtonOwner,
  messageKey: TranslationKey | undefined,
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
  shortPressAt: null,
  ignoreDownUntilRelease: false,
  keyboardDown: false,
  hardwareDown: false,
  screenDown: false,
  armed: false,
  ledMode: "off",
  claims: {},
  armedOwners: {},
  buttonOwner: null,
  bannerVisible: {},
  bannerMessageKeys: {},
  bannerContent: {},
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
    recomputeButtonRouting(set, get, claims, get().armedOwners);
  },

  releaseButton: (owner) => {
    log.event("BUTTON", "release claim", { owner });
    const claims = { ...get().claims };
    delete claims[owner];
    const armedOwners = { ...get().armedOwners };
    delete armedOwners[owner];
    const bannerVisible = { ...get().bannerVisible };
    delete bannerVisible[owner];
    const bannerMessageKeys = { ...get().bannerMessageKeys };
    delete bannerMessageKeys[owner];
    const bannerContent = { ...get().bannerContent };
    delete bannerContent[owner];
    set({ bannerVisible, bannerMessageKeys, bannerContent });
    recomputeButtonRouting(set, get, claims, armedOwners);
  },

  setButtonBannerVisible: (owner, visible) => {
    setBannerVisibleForOwner(set, get, owner, visible);
  },

  setButtonBannerMessageKey: (owner, messageKey) => {
    setBannerMessageKeyForOwner(set, get, owner, messageKey);
  },

  setButtonBannerContent: (owner, content) => {
    setBannerContentForOwner(set, get, owner, content);
  },

  setButtonArmed: (owner, armed) => {
    const armedOwners = { ...get().armedOwners };
    if (armed) {
      armedOwners[owner] = true;
    } else {
      delete armedOwners[owner];
    }
    if (get().buttonOwner === owner) {
      recomputeButtonRouting(set, get, get().claims, armedOwners);
      return;
    }
    set({ armedOwners });
  },

  /**
   * The on-screen mic button, held or let go. Only its owner's button is on screen, so a
   * press from anyone else is ignored. Safe while disarmed — a press held through the
   * arming that follows (a mic button that also wakes the agent) counts once armed.
   */
  setButtonScreenDown: (owner, down) => {
    if (down && get().buttonOwner !== owner) return;
    if (get().screenDown === down) return;
    set({ screenDown: down });
    recomputePressed(set, get, "screen");
  },

  /**
   * End the press from the owner's side — the take is over (the text is full, the mic
   * cannot be had, the agent was switched off) though the visitor is still holding. The
   * hold is then ignored until it is let go, as after a handoff.
   */
  endButtonPress: (owner) => {
    if (get().buttonOwner !== owner || !get().pressed) return;
    log.event("BUTTON", "press ended by owner", { owner });
    set({ ignoreDownUntilRelease: true });
    recomputePressed(set, get);
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
    pressStartedAt = null;
    set({
      pressed: false,
      shortPressAt: null,
      ignoreDownUntilRelease: false,
      keyboardDown: false,
      hardwareDown: false,
      screenDown: false,
      armed: false,
      ledMode: "off",
      claims: {},
      armedOwners: {},
      buttonOwner: null,
      bannerVisible: {},
      bannerMessageKeys: {},
      bannerContent: {},
      activeButtonBanner: false,
    });
  },
}));

/** Reset module singletons — for tests only. */
export function _resetButtonStoreForTests(): void {
  void buttonTransport?.disconnect();
  buttonTransport = null;
  keyboardInitialized = false;
  pressStartedAt = null;
  useButtonStore.setState({
    pressed: false,
    shortPressAt: null,
    ignoreDownUntilRelease: false,
    keyboardDown: false,
    hardwareDown: false,
    screenDown: false,
    armed: false,
    ledMode: "off",
    claims: {},
    armedOwners: {},
    buttonOwner: null,
    bannerVisible: {},
    bannerMessageKeys: {},
    bannerContent: {},
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
