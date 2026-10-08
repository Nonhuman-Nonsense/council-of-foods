type Edge = { to: FakeNode; input: number };

/** Just enough of a Web Audio graph to follow where a node's sound ends up. */
export class FakeNode {
  edges: Edge[] = [];
  gain = { value: 1 };
  constructor(readonly kind: "gain" | "merger" | "destination" | "source") {}
  connect(to: FakeNode, _output = 0, input = 0) {
    this.edges.push({ to, input });
  }
  disconnect() {
    this.edges = [];
  }
}

/**
 * Which output channels a node reaches: "LR" for the destination's stereo as a whole,
 * "L" / "R" for the side of a merger it feeds, "" for nowhere.
 */
export function sidesReached(node: AudioNode | FakeNode, destination: FakeNode): string {
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
