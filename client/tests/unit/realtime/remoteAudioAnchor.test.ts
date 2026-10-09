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

/**
 * Every question the captions ask of the audio uses one pause length. A 100 ms dip is the
 * gap between words; a 200 ms gap is a real pause — after a cut, the old reply's audio can
 * run into the next one with little more than that between them (observed: 203 ms).
 */
const GAPS = [
  { gapMs: 100, pause: false },
  { gapMs: 200, pause: true },
];

function createAnchor() {
  const onAudioStart = vi.fn();
  const onArmed = vi.fn();
  const anchor = createRemoteAudioAnchor({ track: {} as MediaStreamTrack, onAudioStart, onArmed });
  return { anchor, onAudioStart, onArmed };
}

describe("remoteAudioAnchor telling a pause from a dip between words", () => {
  it.each(GAPS)("the old reply has stopped, after a $gapMs ms gap: $pause", ({ gapMs, pause }) => {
    const { anchor, onArmed } = createAnchor();

    anchor.arm(true);
    play("speech", 500);
    play("quiet", gapMs);
    play("speech", 500);

    expect(onArmed).toHaveBeenCalledTimes(pause ? 1 : 0);
  });

  it.each(GAPS)("$gapMs ms of quiet ends the sound: $pause", ({ gapMs, pause }) => {
    const { anchor } = createAnchor();

    play("speech", 500);
    play("quiet", gapMs);

    expect(anchor.isAudible()).toBe(!pause);
  });

  /**
   * Asked for while the previous reply still plays, the next reply's start is the first
   * sound after a pause. A gap that passes for a dip anchors the next reply on a pause
   * inside it instead, a sentence late.
   */
  it.each(GAPS)("a reply starting $gapMs ms after the last one is its start: $pause", ({ gapMs, pause }) => {
    const { anchor, onAudioStart } = createAnchor();

    anchor.arm();
    play("speech", 500);
    anchor.arm();
    play("quiet", gapMs);
    play("speech", 500);

    expect(onAudioStart).toHaveBeenCalledTimes(pause ? 2 : 1);
  });
});
