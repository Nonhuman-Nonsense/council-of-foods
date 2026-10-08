import { describe, it, expect, vi, afterEach } from "vitest";
import { audioBusesFor, createVoicesSideOutput, setAudioSplit } from "@/audio/audioRouting";
import { FakeNode, sidesReached } from "./fakeAudioGraph";

function fakeContext() {
  const destination = new FakeNode("destination");
  const ctx = {
    destination,
    createGain: () => new FakeNode("gain"),
    createChannelMerger: () => new FakeNode("merger"),
  };
  return { ctx: ctx as unknown as AudioContext, destination };
}

describe("audio routing", () => {
  it.each([
    { split: false, scene: "LR", voices: "LR" },
    { split: true, scene: "L,R", voices: "R" },
  ])("split=$split: the scene reaches $scene, the voices $voices", ({ split, scene, voices }) => {
    const { ctx, destination } = fakeContext();
    const buses = audioBusesFor(ctx);

    setAudioSplit(ctx, split);

    expect(sidesReached(buses.scene, destination)).toBe(scene);
    expect(sidesReached(buses.voices, destination)).toBe(voices);
  });

  it("joins back into one mix when the split is switched off", () => {
    const { ctx, destination } = fakeContext();
    const buses = audioBusesFor(ctx);

    setAudioSplit(ctx, true);
    setAudioSplit(ctx, false);

    expect(sidesReached(buses.scene, destination)).toBe("LR");
    expect(sidesReached(buses.voices, destination)).toBe("LR");
  });

  it("splits buses made after the split was switched on", () => {
    const { ctx, destination } = fakeContext();

    setAudioSplit(ctx, true);
    const buses = audioBusesFor(ctx);

    expect(sidesReached(buses.voices, destination)).toBe("R");
  });

  it("gives every caller on one context the same buses", () => {
    const { ctx } = fakeContext();
    expect(audioBusesFor(ctx)).toBe(audioBusesFor(ctx));
  });
});

describe("a realtime agent on the voices side", () => {
  /** The context `createVoicesSideOutput` makes for itself, with the track's source node. */
  let made: { destination: FakeNode; source: FakeNode; gains: FakeNode[] };

  function stubAudioContext() {
    vi.stubGlobal(
      "AudioContext",
      class {
        state = "running";
        destination = new FakeNode("destination");
        constructor() {
          made = { destination: this.destination, source: new FakeNode("gain"), gains: [] };
        }
        createMediaStreamSource() {
          return made.source;
        }
        createGain() {
          const gain = new FakeNode("gain");
          made.gains.push(gain);
          return gain;
        }
        createChannelMerger() {
          return new FakeNode("merger");
        }
        close() {
          return Promise.resolve();
        }
      },
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reaches the right side only", () => {
    stubAudioContext();
    createVoicesSideOutput({} as MediaStreamTrack);

    expect(sidesReached(made.source as unknown as AudioNode, made.destination)).toBe("R");
  });

  it("goes silent when the agent is muted, and comes back", () => {
    stubAudioContext();
    const output = createVoicesSideOutput({} as MediaStreamTrack);

    output.setMuted(true);
    expect(made.gains.map((g) => g.gain.value)).toEqual([0]);

    output.setMuted(false);
    expect(made.gains.map((g) => g.gain.value)).toEqual([1]);
  });
});
