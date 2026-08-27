import { create } from "zustand";
import {
  acquireMicrophone,
  MicrophoneUnavailableError,
  queryMicPermission,
  watchMicPermission,
  type MicPermissionState,
  type MicrophoneErrorReason,
} from "@realtime/realtimeConnection";
import { log } from "@/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * What we know about this browser's microphone, from the Permissions API where
 * it is supported and from observed `getUserMedia` outcomes everywhere else.
 *
 * - `unknown` — never checked, and nothing has been attempted yet.
 * - `prompt` — an attempt would show the browser's permission prompt.
 * - `granted` — permission is in place; an attempt succeeds silently.
 * - `unavailable` — the last attempt failed. `reason` says why (blocked,
 *   missing hardware, in use, insecure context…).
 */
export type MicAvailability = "unknown" | "prompt" | "granted" | "unavailable";

type MicAvailabilityStore = {
  availability: MicAvailability;
  /** Set when `availability` is `"unavailable"`; drives the notice copy. */
  reason: MicrophoneErrorReason | null;
  /** True while the "microphone is blocked" overlay should be shown. */
  noticeOpen: boolean;
  setAvailability: (availability: MicAvailability, reason?: MicrophoneErrorReason | null) => void;
  openNotice: () => void;
  closeNotice: () => void;
  resetForTests: () => void;
};

// ---------------------------------------------------------------------------
// Session persistence
// ---------------------------------------------------------------------------

/**
 * Session-scoped, not permanent: reloading is a legitimate way to get a fresh
 * prompt in Firefox, and a visitor who fixes their settings should not have to
 * fight a stale "blocked" we wrote yesterday. Within one session it saves us
 * re-attempting a mic we already know is unavailable on every remount.
 */
const STORAGE_KEY = "councilMicAvailability";

type PersistedState = { availability: MicAvailability; reason: MicrophoneErrorReason | null };

function readPersisted(): PersistedState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { availability: "unknown", reason: null };
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const availability = parsed.availability;
    if (
      availability !== "unknown" &&
      availability !== "prompt" &&
      availability !== "granted" &&
      availability !== "unavailable"
    ) {
      return { availability: "unknown", reason: null };
    }
    return { availability, reason: parsed.reason ?? null };
  } catch {
    return { availability: "unknown", reason: null };
  }
}

function writePersisted(state: PersistedState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage errors (private mode, quota, etc.)
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useMicAvailabilityStore = create<MicAvailabilityStore>((set) => ({
  ...readPersisted(),
  noticeOpen: false,

  setAvailability: (availability, reason = null) =>
    set(() => {
      const next = { availability, reason: availability === "unavailable" ? reason : null };
      writePersisted(next);
      return next;
    }),

  openNotice: () => set({ noticeOpen: true }),
  closeNotice: () => set({ noticeOpen: false }),

  resetForTests: () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    set({ availability: "unknown", reason: null, noticeOpen: false });
  },
}));

// ---------------------------------------------------------------------------
// Non-React helpers (mirrors the errorStore pattern)
// ---------------------------------------------------------------------------

export function getMicAvailability(): MicAvailability {
  return useMicAvailabilityStore.getState().availability;
}

export function setMicAvailability(
  availability: MicAvailability,
  reason?: MicrophoneErrorReason | null,
): void {
  useMicAvailabilityStore.getState().setAvailability(availability, reason);
}

/** Show the "you need to allow the microphone" overlay. */
export function openMicNotice(): void {
  useMicAvailabilityStore.getState().openNotice();
}

export function closeMicNotice(): void {
  useMicAvailabilityStore.getState().closeNotice();
}

function availabilityFromPermission(state: MicPermissionState): MicAvailability | null {
  switch (state) {
    case "granted":
      return "granted";
    case "prompt":
      return "prompt";
    case "denied":
      return "unavailable";
    // The Permissions API can't answer — leave whatever we learned by trying.
    case "unsupported":
      return null;
  }
}

/**
 * Read the permission up front so callers can decide whether a `getUserMedia`
 * would prompt, succeed, or fail instantly. Safe to call repeatedly.
 */
export async function refreshMicAvailability(): Promise<MicAvailability> {
  const permission = await queryMicPermission();
  const availability = availabilityFromPermission(permission);
  if (availability) {
    setMicAvailability(availability, permission === "denied" ? "permission_denied" : null);
  }
  return getMicAvailability();
}

/**
 * Keep the store in step with the browser, so a visitor who allows the mic in
 * site settings mid-session is noticed without a reload. Returns an unsubscribe.
 */
export function watchMicAvailability(): () => void {
  return watchMicPermission((state) => {
    const availability = availabilityFromPermission(state);
    if (!availability) return;
    log.event("REALTIME", "mic permission changed", { state });
    setMicAvailability(availability, state === "denied" ? "permission_denied" : null);
  });
}

export type RequestMicrophoneOptions = {
  /**
   * The visitor asked for this — a mic button, not a background pre-warm. A
   * failed request they made deserves an explanation; one they never made
   * should stay quiet rather than throwing a modal in front of them.
   */
  userInitiated?: boolean;
};

/**
 * `acquireMicrophone` plus bookkeeping: every mic request in the app goes
 * through here, so the store reflects what the browser actually did and the
 * "microphone is blocked" overlay has exactly one trigger. Callers never open
 * that overlay themselves — they just say whether the visitor asked.
 *
 * Rethrows unchanged.
 */
export async function requestMicrophone(
  { userInitiated = false }: RequestMicrophoneOptions = {},
): Promise<MediaStream> {
  try {
    const stream = await acquireMicrophone();
    setMicAvailability("granted");
    return stream;
  } catch (err) {
    if (err instanceof MicrophoneUnavailableError) {
      log.event("REALTIME", "microphone unavailable", {
        reason: err.reason,
        userInitiated,
      });
      setMicAvailability("unavailable", err.reason);
      if (userInitiated) openMicNotice();
    }
    throw err;
  }
}
