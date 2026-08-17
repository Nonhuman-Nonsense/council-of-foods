import { create } from "zustand";
import {
  ButtonTransport,
  isButtonBridgeAvailable,
  type ButtonTransportStatus,
} from "./buttonBridge";
import { getCapabilities } from "@/settings/councilSettings";
import { log } from "@/logger";
import type { TranslationKey } from "@/i18n";

/** Below this, a press is a tap (toggles the latch); at or above, it's a hold. */
const TAP_MS = 250;

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
   * A tap latched the mic open (capabilities.latchOnTap only — see
   * `recomputePressed`). Combined with `pressed` by `useButton`'s `wantsMic`;
   * `pressed` itself stays purely physical so edge-triggered consumers
   * (autoplay, summary, replay) are unaffected by latching.
   */
  latched: boolean;
  /** When true, held input is ignored until all keys/buttons release (owner handoff). */
  ignoreDownUntilRelease: boolean;
  keyboardDown: boolean;
  hardwareDown: boolean;
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

  syncPressed: (source?: "keyboard" | "button") => void;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  enableAutoReconnect: () => void;
  claimButton: (owner: ButtonOwner) => void;
  releaseButton: (owner: ButtonOwner) => void;
  setButtonArmed: (owner: ButtonOwner, armed: boolean) => void;
  toggleButtonLatch: (owner: ButtonOwner) => void;
  clearButtonLatch: (owner: ButtonOwner) => void;
  setButtonBannerVisible: (owner: ButtonOwner, visible: boolean) => void;
  setButtonBannerMessageKey: (owner: ButtonOwner, messageKey: TranslationKey | undefined) => void;
  setButtonBannerContent: (owner: ButtonOwner, content: BannerContent | undefined) => void;
  resyncLed: () => Promise<void>;
  init: () => void;
  dispose: () => void;
};

let buttonTransport: ButtonTransport | null = null;
let keyboardInitialized = false;
/** When the current physical press began; not reactive, so a module var. */
let pressStartedAt: number | null = null;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

/**
 * Decides tap vs hold on a genuine press→release cycle (`web`'s
 * `capabilities.latchOnTap` only — museum always takes the hold branch, i.e.
 * releasing simply closes, whatever the duration). A tap toggles `latched`; a
 * hold always clears it, which doubles as an explicit "close" gesture for a
 * mic a previous tap left open. Disarms and owner changes clear `latched`
 * directly (see `recomputeButtonRouting`) and null out `pressStartedAt` first,
 * so this function sees nothing to decide and leaves that forced value alone.
 */
function resolveLatchOnRelease(currentlyLatched: boolean): boolean {
  if (pressStartedAt == null) return currentlyLatched;
  const duration = Date.now() - pressStartedAt;
  pressStartedAt = null;
  if (getCapabilities().latchOnTap && duration < TAP_MS) {
    return !currentlyLatched;
  }
  return false;
}

function recomputePressed(
  set: (partial: Partial<ButtonStore> | ((state: ButtonStore) => Partial<ButtonStore>)) => void,
  get: () => ButtonStore,
  source?: "keyboard" | "button",
): void {
  const {
    armed,
    keyboardDown,
    hardwareDown,
    pressed: prevPressed,
    latched: prevLatched,
    ledMode: prevLedMode,
    ignoreDownUntilRelease,
  } = get();
  const inputDown = keyboardDown || hardwareDown;
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

  let latched = prevLatched;
  if (!prevPressed && pressed) {
    pressStartedAt = Date.now();
  } else if (prevPressed && !pressed) {
    latched = resolveLatchOnRelease(prevLatched);
    updates.latched = latched;
  }

  const ledMode = resolveLedMode(armed, pressed || latched);
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
  // Treat losing focus as a release; the duration still decides tap vs hold.
  const onBlur = () => {
    if (!get().keyboardDown) return;
    set({ keyboardDown: false });
    recomputePressed(set, get, "keyboard");
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
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

  // A latch belongs to the owner and the arming that produced it: the next
  // owner starts clean, and disarming forces the mic shut rather than leaving
  // it held open by a gesture that is no longer allowed. Clearing
  // `pressStartedAt` too stops `recomputePressed` from reading the disarm as a
  // fast release and latching on from a non-gesture.
  if (prevOwner !== buttonOwner || !armed) {
    pressStartedAt = null;
    set({ latched: false });
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

function setLatch(
  set: (partial: Partial<ButtonStore> | ((state: ButtonStore) => Partial<ButtonStore>)) => void,
  get: () => ButtonStore,
  owner: ButtonOwner,
  latched: boolean,
  source: "click" | "owner",
): void {
  log.event("BUTTON", latched ? "latch on" : "latch off", { owner, source });
  const ledMode = resolveLedMode(get().armed, get().pressed || latched);
  set({ latched, ledMode });
  void pushLedToHardware(set, get, ledMode);
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
  latched: false,
  ignoreDownUntilRelease: false,
  keyboardDown: false,
  hardwareDown: false,
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
   * The same latch a tap toggles, for an on-screen mic button: clicking one is
   * the same gesture by another input device, so it must not become a second
   * source of truth. Safe to call while disarmed — arming preserves an existing
   * latch, so a click that also wakes the agent survives the arming that follows.
   */
  toggleButtonLatch: (owner) => {
    if (get().buttonOwner !== owner) return;
    setLatch(set, get, owner, !get().latched, "click");
  },

  /**
   * End a latched-open mic from the owner's side — the visitor turned to
   * something else (typing, say) and the take is over. Disarming clears the
   * latch too, but an owner whose state settles back to "armed" in the same
   * React batch never renders as disarmed, so it cannot be relied on alone.
   */
  clearButtonLatch: (owner) => {
    if (get().buttonOwner !== owner || !get().latched) return;
    setLatch(set, get, owner, false, "owner");
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
      latched: false,
      ignoreDownUntilRelease: false,
      keyboardDown: false,
      hardwareDown: false,
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
    latched: false,
    ignoreDownUntilRelease: false,
    keyboardDown: false,
    hardwareDown: false,
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
