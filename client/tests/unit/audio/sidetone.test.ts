import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeNode, sidesReached } from "./fakeAudioGraph";

type Sidetone = typeof import("@/audio/sidetone");

/** A context the sidetone made for itself, with a source node per mic track it plays. */
type MadeContext = {
  destination: FakeNode;
  sources: Map<MediaStreamTrack, FakeNode>;
  closed: boolean;
};

let made: MadeContext[];
let sidetone: Sidetone;

function stubAudio() {
  vi.stubGlobal(
    "AudioContext",
    class {
      state = "running";
      destination = new FakeNode("destination");
      record: MadeContext = { destination: this.destination, sources: new Map(), closed: false };
      constructor() {
        made.push(this.record);
      }
      createMediaStreamSource(stream: { tracks: MediaStreamTrack[] }) {
        const source = new FakeNode("source");
        this.record.sources.set(stream.tracks[0], source);
        return source;
      }
      createGain() {
        return new FakeNode("gain");
      }
      createChannelMerger() {
        return new FakeNode("merger");
      }
      close() {
        this.record.closed = true;
        this.state = "closed";
        return Promise.resolve();
      }
    },
  );
  vi.stubGlobal(
    "MediaStream",
    class {
      constructor(readonly tracks: MediaStreamTrack[]) {}
    },
  );
}

/** A mic as `getUserMedia` hands it back: one audio track, live until stopped. */
function mic() {
  const track = { readyState: "live" } as { readyState: MediaStreamTrackState };
  const stream = { getAudioTracks: () => [track as MediaStreamTrack] } as MediaStream;
  return { stream, track: track as MediaStreamTrack, stop: () => (track.readyState = "ended") };
}

/** Where a mic's sound ends up on the current output, "" if it is not played at all. */
function heard(track: MediaStreamTrack): string {
  const ctx = made.at(-1);
  if (!ctx || ctx.closed) return "";
  const source = ctx.sources.get(track);
  return source ? sidesReached(source, ctx.destination) : "";
}

beforeEach(async () => {
  made = [];
  stubAudio();
  // The sidetone keeps the mics it was given; each test starts with none.
  vi.resetModules();
  sidetone = await import("@/audio/sidetone");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sidetone", () => {
  it("opens no audio output while the level is off", () => {
    sidetone.monitorMicrophone(mic().stream);
    sidetone.setSidetone({ level: 0, split: true });

    expect(made).toEqual([]);
  });

  it.each([
    { split: false, sides: "LR" },
    { split: true, sides: "R" },
  ])("split=$split: the mic reaches $sides", ({ split, sides }) => {
    const { stream, track } = mic();
    sidetone.setSidetone({ level: 0.5, split });
    sidetone.monitorMicrophone(stream);

    expect(heard(track)).toBe(sides);
  });

  it("follows the split when it is switched after the mic was opened", () => {
    const { stream, track } = mic();
    sidetone.setSidetone({ level: 0.5, split: false });
    sidetone.monitorMicrophone(stream);

    sidetone.setSidetone({ level: 0.5, split: true });

    expect(heard(track)).toBe("R");
  });

  it("plays a mic opened before the level was turned up", () => {
    const { stream, track } = mic();
    sidetone.monitorMicrophone(stream);

    sidetone.setSidetone({ level: 0.5, split: false });

    expect(heard(track)).toBe("LR");
  });

  it("closes the output when the level goes back to off", () => {
    sidetone.monitorMicrophone(mic().stream);
    sidetone.setSidetone({ level: 0.5, split: false });

    sidetone.setSidetone({ level: 0, split: false });

    expect(made.map((ctx) => ctx.closed)).toEqual([true]);
  });

  it("lets go of a mic once it has been stopped", () => {
    const first = mic();
    sidetone.setSidetone({ level: 0.5, split: false });
    sidetone.monitorMicrophone(first.stream);

    first.stop();
    sidetone.monitorMicrophone(mic().stream);

    expect(heard(first.track)).toBe("");
  });

  it("does not bring a stopped mic back when the level is turned up again", () => {
    const first = mic();
    sidetone.monitorMicrophone(first.stream);
    first.stop();

    sidetone.setSidetone({ level: 0.5, split: false });

    expect(made[0].sources.has(first.track)).toBe(false);
  });
});
