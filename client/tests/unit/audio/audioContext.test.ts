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
  function contextIn(state: AudioContextState) {
    const ctx = {
      state,
      suspend: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
    };
    return { ctx, ref: { current: ctx } as unknown as AudioContextRef };
  }

  // `state` lags a pending call: "suspended" while a resume is on its way, "running" while a
  // suspend is. Whatever it says, the call asked for is the one made.
  it.each([
    { state: "running", suspended: true, call: "suspend" },
    { state: "suspended", suspended: true, call: "suspend" },
    { state: "suspended", suspended: false, call: "resume" },
    { state: "running", suspended: false, call: "resume" },
  ] as const)("asks a $state context to $call", ({ state, suspended, call }) => {
    const { ctx, ref } = contextIn(state);
    setAudioSuspended(ref, suspended);
    expect(ctx[call]).toHaveBeenCalledTimes(1);
    expect(ctx[call === "suspend" ? "resume" : "suspend"]).not.toHaveBeenCalled();
  });

  it("pauses a context whose resume has not finished yet", () => {
    const { ctx, ref } = contextIn("suspended");
    setAudioSuspended(ref, false);
    setAudioSuspended(ref, true);
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(ctx.suspend).toHaveBeenCalledTimes(1);
    expect(ctx.suspend.mock.invocationCallOrder[0]).toBeGreaterThan(ctx.resume.mock.invocationCallOrder[0]);
  });

  it("leaves a closed context alone", () => {
    const { ctx, ref } = contextIn("closed");
    setAudioSuspended(ref, true);
    setAudioSuspended(ref, false);
    expect(ctx.suspend).not.toHaveBeenCalled();
    expect(ctx.resume).not.toHaveBeenCalled();
  });

  it("no-ops when context ref is null", () => {
    setAudioSuspended({ current: null }, true);
  });
});
