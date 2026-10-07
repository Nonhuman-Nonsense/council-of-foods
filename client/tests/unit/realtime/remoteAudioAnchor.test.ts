import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRemoteAudioAnchor } from "@realtime/remoteAudioAnchor";

/** Byte time-domain sample: 128 is silence, the offset sets the RMS. */
let sampleByte = 128;
let nowMs = 0;
let frame: FrameRequestCallback | null = null;

class FakeAudioContext {
  state = "running";
  currentTime = 0;
  createMediaStreamSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  createAnalyser() {
    return {
      fftSize: 0,
      smoothingTimeConstant: 0,
      disconnect: vi.fn(),
      getByteTimeDomainData: (data: Uint8Array) => data.fill(sampleByte),
    };
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    return Promise.resolve();
  }
}

/** Run the analyser for `ms` at ~60fps with the line at `level`. */
function play(level: "speech" | "quiet", ms: number): void {
  sampleByte = level === "speech" ? 140 : 128;
  for (let elapsed = 0; elapsed < ms; elapsed += 16) {
    nowMs += 16;
    frame?.(nowMs);
  }
}

beforeEach(() => {
  sampleByte = 128;
  nowMs = 0;
  frame = null;
  vi.stubGlobal("AudioContext", FakeAudioContext);
  vi.stubGlobal("MediaStream", class {});
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frame = cb;
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.spyOn(performance, "now").mockImplementation(() => nowMs);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("remoteAudioAnchor waiting for the previous response to finish", () => {
  /**
   * After a barge-in the old audio's tail can run almost straight into the
   * new response. A gap missed there anchors the caption clock on a pause
   * inside the new response, a whole sentence late (observed: a 203ms gap).
   */
  it.each([
    { gapMs: 200, confirmed: true },
    { gapMs: 100, confirmed: false },
  ])("a $gapMs ms gap in the audio confirms silence: $confirmed", ({ gapMs, confirmed }) => {
    const onArmed = vi.fn();
    const anchor = createRemoteAudioAnchor({
      track: {} as MediaStreamTrack,
      onAudioStart: vi.fn(),
      onArmed,
    });

    anchor.arm(true);
    play("speech", 500);
    play("quiet", gapMs);
    play("speech", 500);

    expect(onArmed).toHaveBeenCalledTimes(confirmed ? 1 : 0);
  });
});
