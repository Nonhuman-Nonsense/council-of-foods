import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSilentWavBytes,
  canAutoplayAudio,
  resetAutoplayCacheForTests,
} from "@/audio/canAutoplay";

/** Stands in for the browser's answer to `audio.play()`. */
function stubPlay(result: "resolves" | "rejects") {
  const play = vi.fn(() =>
    result === "resolves" ? Promise.resolve() : Promise.reject(new Error("NotAllowedError")),
  );
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    writable: true,
    value: play,
  });
  return play;
}

function stubAutoplayPolicy(policy: string | undefined) {
  Object.defineProperty(navigator, "getAutoplayPolicy", {
    configurable: true,
    writable: true,
    value: policy == null ? undefined : vi.fn(() => policy),
  });
}

function stubUserActivation(hasBeenActive: boolean | undefined) {
  Object.defineProperty(navigator, "userActivation", {
    configurable: true,
    writable: true,
    value: hasBeenActive == null ? undefined : { hasBeenActive, isActive: hasBeenActive },
  });
}

describe("the probe's audio source", () => {
  /**
   * Regression: this was a hand-pasted base64 blob that lost one padding
   * character. It decoded to nothing, every probe answered "blocked", and the
   * agent silently stopped starting on its own in every browser.
   */
  it("is a well-formed PCM wav", () => {
    const bytes = buildSilentWavBytes();
    const view = new DataView(bytes);
    const ascii = (offset: number, length: number) =>
      String.fromCharCode(...new Uint8Array(bytes, offset, length));

    expect(ascii(0, 4)).toBe("RIFF");
    expect(ascii(8, 4)).toBe("WAVE");
    expect(ascii(12, 4)).toBe("fmt ");
    expect(ascii(36, 4)).toBe("data");

    // Sizes have to agree with reality, or decoders reject the file outright.
    expect(view.getUint32(4, true)).toBe(bytes.byteLength - 8);
    expect(view.getUint32(40, true)).toBe(bytes.byteLength - 44);

    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
    expect(view.getUint32(28, true)).toBe(
      view.getUint32(24, true) * view.getUint16(32, true),
    ); // byte rate = sample rate × block align
  });
});

describe("canAutoplayAudio", () => {
  beforeEach(() => {
    resetAutoplayCacheForTests();
    stubAutoplayPolicy(undefined);
    stubUserActivation(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("takes the browser's own answer when it offers one", async () => {
    // Firefox 112+ implements this; nothing else does.
    const cases: Array<[string, boolean]> = [
      ["allowed", true],
      ["disallowed", false],
      // Muted playback is always permitted and says nothing about audible.
      ["allowed-muted", false],
    ];

    for (const [policy, expected] of cases) {
      stubAutoplayPolicy(policy);
      stubPlay("rejects");

      await expect(canAutoplayAudio(), policy).resolves.toBe(expected);
    }
  });

  it("trusts an interaction the visitor has already made", async () => {
    // Sticky activation is exactly the condition all three engines require, and
    // reading it beats probing at a moment that races the browser's bookkeeping.
    stubUserActivation(true);
    const play = stubPlay("rejects");

    await expect(canAutoplayAudio()).resolves.toBe(true);
    expect(play).not.toHaveBeenCalled();
  });

  it("asks by trying when nothing else can answer", async () => {
    const cases: Array<["resolves" | "rejects", boolean]> = [
      ["resolves", true],
      ["rejects", false],
    ];

    for (const [result, expected] of cases) {
      const play = stubPlay(result);

      await expect(canAutoplayAudio(), result).resolves.toBe(expected);
      expect(play, result).toHaveBeenCalled();
    }
  });

  it("probes with sound on, since muted playback is never blocked", async () => {
    stubPlay("resolves");
    const muted = vi.spyOn(HTMLMediaElement.prototype, "muted", "set");

    await canAutoplayAudio();

    expect(muted).toHaveBeenCalledWith(false);
  });
});
