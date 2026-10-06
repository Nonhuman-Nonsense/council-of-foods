import { describe, it, expect } from "vitest";
import { audioBusesFor, setAudioSplit } from "@/audio/audioRouting";

type Edge = { to: FakeNode; input: number };

/** Just enough of a Web Audio graph to follow where a node's sound ends up. */
class FakeNode {
  edges: Edge[] = [];
  constructor(readonly kind: "gain" | "merger" | "destination") {}
  connect(to: FakeNode, _output = 0, input = 0) {
    this.edges.push({ to, input });
  }
  disconnect() {
    this.edges = [];
  }
}

function fakeContext() {
  const destination = new FakeNode("destination");
  const ctx = {
    destination,
    createGain: () => new FakeNode("gain"),
    createChannelMerger: () => new FakeNode("merger"),
  };
  return { ctx: ctx as unknown as AudioContext, destination };
}

/**
 * Which output channels a node reaches: "LR" for the destination's stereo as a whole,
 * "L" / "R" for the side of a merger it feeds.
 */
function sidesReached(node: AudioNode, destination: FakeNode): string {
  const sides = new Set<string>();
  const walk = (from: FakeNode, side: string | null) => {
    for (const { to, input } of from.edges) {
      if (to === destination) sides.add(side ?? "LR");
      else walk(to, to.kind === "merger" ? (input === 0 ? "L" : "R") : side);
    }
  };
  walk(node as unknown as FakeNode, null);
  return [...sides].sort().join(",");
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
