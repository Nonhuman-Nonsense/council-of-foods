import { describe, it, expect, vi } from "vitest";
import { createAudioContext, setAudioSuspended } from "@/audio/audioContext";
import type { AudioContextRef } from "@/audio/audioContext";

describe("createAudioContext", () => {
  it("returns an AudioContext", () => {
    const ctx = createAudioContext();
    expect(ctx).toBeInstanceOf(window.AudioContext);
    if (typeof ctx.close === "function") {
      void ctx.close();
    }
  });

  it("throws when Web Audio is unavailable", () => {
    const original = window.AudioContext;
    // @ts-expect-error test shim
    window.AudioContext = undefined;
    // @ts-expect-error test shim
    window.webkitAudioContext = undefined;

    expect(() => createAudioContext()).toThrow(
      "Web Audio API is not available in this environment",
    );

    window.AudioContext = original;
  });
});

describe("setAudioSuspended", () => {
  it("suspends a running context", () => {
    const suspend = vi.fn();
    const audioContext = {
      current: { state: "running", suspend },
    } as unknown as AudioContextRef;

    setAudioSuspended(audioContext, true);

    expect(suspend).toHaveBeenCalled();
  });

  it("resumes a suspended context", () => {
    const resume = vi.fn();
    const audioContext = {
      current: { state: "suspended", resume },
    } as unknown as AudioContextRef;

    setAudioSuspended(audioContext, false);

    expect(resume).toHaveBeenCalled();
  });

  it("no-ops when context ref is null", () => {
    setAudioSuspended({ current: null }, true);
  });
});
