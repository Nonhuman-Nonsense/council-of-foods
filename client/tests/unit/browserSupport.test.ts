import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findMissingFeatures, type BrowserFeature } from "@/browserSupport";

type Decode = "ok" | "fail" | "hang";

/** A browser that has everything, with `decode` deciding how Ogg/Opus decoding answers. */
function fullBrowser(decode: Decode = "ok"): Record<string, unknown> {
  class FakeOfflineAudioContext {
    decodeAudioData(_data: ArrayBuffer, onOk: () => void, onFail: () => void) {
      if (decode === "ok") onOk();
      if (decode === "fail") onFail();
      return new Promise(() => {});
    }
  }
  const fn = () => {};
  return {
    structuredClone: fn,
    AbortSignal: { timeout: fn },
    crypto: { randomUUID: fn },
    WebSocket: fn,
    AudioContext: fn,
    OfflineAudioContext: FakeOfflineAudioContext,
    atob: (s: string) => atob(s),
    navigator: { mediaDevices: { getUserMedia: fn } },
    RTCPeerConnection: fn,
  };
}

async function missingIn(scope: Record<string, unknown>): Promise<BrowserFeature[]> {
  return findMissingFeatures(scope as never);
}

describe("findMissingFeatures", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each<{ name: string; change: (scope: Record<string, unknown>) => void; missing: BrowserFeature[] }>([
    { name: "a browser with everything", change: () => {}, missing: [] },
    { name: "no structuredClone", change: (s) => delete s.structuredClone, missing: ["modern-js"] },
    { name: "no AbortSignal.timeout", change: (s) => (s.AbortSignal = {}), missing: ["modern-js"] },
    { name: "no WebSocket", change: (s) => delete s.WebSocket, missing: ["websocket"] },
    { name: "no AudioContext", change: (s) => delete s.AudioContext, missing: ["webaudio"] },
    { name: "no OfflineAudioContext", change: (s) => delete s.OfflineAudioContext, missing: ["webaudio"] },
    { name: "Ogg/Opus that fails to decode", change: (s) => Object.assign(s, fullBrowser("fail")), missing: ["ogg-opus"] },
    { name: "no mediaDevices", change: (s) => (s.navigator = {}), missing: ["microphone"] },
    { name: "no RTCPeerConnection", change: (s) => delete s.RTCPeerConnection, missing: ["webrtc"] },
    {
      name: "an old Safari without Ogg or WebRTC",
      change: (s) => {
        Object.assign(s, fullBrowser("fail"));
        delete s.RTCPeerConnection;
      },
      missing: ["ogg-opus", "webrtc"],
    },
  ])("reports $missing for $name", async ({ change, missing }) => {
    const scope = fullBrowser();
    change(scope);
    await expect(missingIn(scope)).resolves.toEqual(missing);
  });

  // The check must never lock out a working browser over a decode that just never answers.
  it("counts a decode that never answers as supported", async () => {
    const result = missingIn(fullBrowser("hang"));
    await vi.advanceTimersByTimeAsync(3000);
    await expect(result).resolves.toEqual([]);
  });
});
