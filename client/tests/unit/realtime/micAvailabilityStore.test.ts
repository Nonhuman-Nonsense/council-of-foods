import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getMicAvailability,
  openMicNotice,
  closeMicNotice,
  refreshMicAvailability,
  requestMicrophone,
  setMicAvailability,
  useMicAvailabilityStore,
  watchMicAvailability,
  type MicAvailability,
} from "@realtime/micAvailabilityStore";
import type { MicPermissionState } from "@realtime/realtimeConnection";

function stubPermissions(query: unknown) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { permissions: { query } },
  });
}

function stubGetUserMedia(getUserMedia: unknown) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { mediaDevices: { getUserMedia } },
  });
}

describe("micAvailabilityStore", () => {
  beforeEach(() => {
    useMicAvailabilityStore.getState().resetForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("records a granted microphone when a request succeeds", async () => {
    const stream = { id: "mic" };
    stubGetUserMedia(vi.fn().mockResolvedValue(stream));

    await expect(requestMicrophone()).resolves.toBe(stream);
    expect(getMicAvailability()).toBe("granted");
  });

  it("records why the microphone is unavailable and rethrows", async () => {
    const cases: Array<[string, string]> = [
      ["NotAllowedError", "permission_denied"],
      ["NotFoundError", "not_found"],
      ["NotReadableError", "in_use"],
    ];

    for (const [name, reason] of cases) {
      useMicAvailabilityStore.getState().resetForTests();
      stubGetUserMedia(vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name })));

      await expect(requestMicrophone()).rejects.toThrow();
      expect(getMicAvailability(), name).toBe("unavailable");
      expect(useMicAvailabilityStore.getState().reason, name).toBe(reason);
    }
  });

  it("explains a failure the visitor asked for, and only that", async () => {
    // One trigger for the overlay, so no consumer has to remember to open it —
    // and a background pre-warm never throws a modal in front of anyone.
    const cases: Array<{ userInitiated: boolean; noticeOpen: boolean }> = [
      { userInitiated: true, noticeOpen: true },
      { userInitiated: false, noticeOpen: false },
    ];

    for (const { userInitiated, noticeOpen } of cases) {
      useMicAvailabilityStore.getState().resetForTests();
      stubGetUserMedia(
        vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" })),
      );

      await expect(requestMicrophone({ userInitiated })).rejects.toThrow();

      expect(useMicAvailabilityStore.getState().noticeOpen, String(userInitiated)).toBe(noticeOpen);
    }
  });

  it("says nothing when the visitor's request succeeds", async () => {
    stubGetUserMedia(vi.fn().mockResolvedValue({ id: "mic" }));

    await requestMicrophone({ userInitiated: true });

    expect(useMicAvailabilityStore.getState().noticeOpen).toBe(false);
  });

  it("drops a stale reason once the microphone is available again", () => {
    setMicAvailability("unavailable", "permission_denied");
    setMicAvailability("granted");

    expect(useMicAvailabilityStore.getState().reason).toBeNull();
  });

  it("maps the browser permission state onto availability", async () => {
    const cases: Array<[MicPermissionState, MicAvailability]> = [
      ["granted", "granted"],
      ["prompt", "prompt"],
      ["denied", "unavailable"],
    ];

    for (const [state, expected] of cases) {
      useMicAvailabilityStore.getState().resetForTests();
      stubPermissions(vi.fn().mockResolvedValue({ state }));

      await expect(refreshMicAvailability(), state).resolves.toBe(expected);
    }
  });

  it("keeps what it learned by trying when the Permissions API can't answer", async () => {
    setMicAvailability("unavailable", "permission_denied");
    stubPermissions(vi.fn().mockRejectedValue(new TypeError("unsupported name")));

    await expect(refreshMicAvailability()).resolves.toBe("unavailable");
    expect(useMicAvailabilityStore.getState().reason).toBe("permission_denied");
  });

  it("survives a remount within the same session", async () => {
    setMicAvailability("unavailable", "permission_denied");

    // A fresh import stands in for the store being re-created on remount.
    vi.resetModules();
    const reloaded = await import("@realtime/micAvailabilityStore");

    expect(reloaded.getMicAvailability()).toBe("unavailable");
    expect(reloaded.useMicAvailabilityStore.getState().reason).toBe("permission_denied");
    reloaded.useMicAvailabilityStore.getState().resetForTests();
  });

  it("notices when the visitor allows the mic in browser settings", async () => {
    // No reload involved: the visitor follows the blocked notice's advice and
    // flips the site setting while the page is open.
    const listeners: Array<() => void> = [];
    const status = {
      state: "denied",
      addEventListener: (_type: string, handler: () => void) => listeners.push(handler),
      removeEventListener: vi.fn(),
    };
    stubPermissions(vi.fn().mockResolvedValue(status));

    const stop = watchMicAvailability();
    await vi.waitFor(() => expect(listeners).toHaveLength(1));

    status.state = "granted";
    listeners[0]();

    expect(getMicAvailability()).toBe("granted");
    stop();
  });

  it("opens and closes the blocked notice independently of availability", () => {
    setMicAvailability("unavailable", "permission_denied");
    expect(useMicAvailabilityStore.getState().noticeOpen).toBe(false);

    openMicNotice();
    expect(useMicAvailabilityStore.getState().noticeOpen).toBe(true);

    closeMicNotice();
    expect(useMicAvailabilityStore.getState().noticeOpen).toBe(false);
    expect(getMicAvailability()).toBe("unavailable");
  });
});
