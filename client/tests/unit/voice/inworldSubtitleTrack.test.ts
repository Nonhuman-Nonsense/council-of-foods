import { describe, expect, it } from "vitest";
import {
  computeInworldAgentSpeaking,
  createInworldSubtitleTrack,
  findActiveSentenceAtTime,
  type InworldWordToken,
} from "@voice/inworldSubtitleTrack";

// Helpers to build token arrays quickly.
function tok(w: string, s: number, e: number): InworldWordToken {
  return { w, s, e };
}
const EMPTY: InworldWordToken[] = [];

describe("createInworldSubtitleTrack", () => {
  describe("sentencesFromWordAlignment — grouping by empty-chunk flush", () => {
    it("produces no sentences until an empty chunk arrives", () => {
      const track = createInworldSubtitleTrack();
      track.applyChunk(1, [tok("Hello", 0.1, 0.5), tok(" ", 0.5, 0.5), tok("world", 0.5, 0.9)]);
      expect(track.getSentences()).toHaveLength(0);
    });

    it("flushes one sentence when an empty chunk arrives", () => {
      const track = createInworldSubtitleTrack();
      track.applyChunk(1, [tok("", 0, 0.1), tok("Hello", 0.1, 0.5)]);
      track.applyChunk(1, [tok(" ", 0.5, 0.5), tok("world", 0.5, 0.9), tok(".", 0.9, 0.9)]);
      track.applyChunk(1, EMPTY);

      const sentences = track.getSentences();
      expect(sentences).toHaveLength(1);
      expect(sentences[0]!.text).toBe("Hello world.");
    });

    it("sets start from first token and end from last token", () => {
      const track = createInworldSubtitleTrack();
      track.applyChunk(1, [tok("", 0, 0.1), tok("Hi", 0.1, 0.4)]);
      track.applyChunk(1, EMPTY);

      const s = track.getSentences()[0]!;
      expect(s.start).toBeCloseTo(0);
      expect(s.end).toBeCloseTo(0.4);
    });

    it("accumulates two sentences with correct offsets", () => {
      const track = createInworldSubtitleTrack();

      // Sentence 1: 0 → 3.0s
      track.applyChunk(1, [tok("", 0, 0.1), tok("Welcome", 0.1, 0.5)]);
      track.applyChunk(1, [tok(".", 2.98, 2.98)]);
      track.applyChunk(1, EMPTY);

      // Sentence 2: resets to 0, should be offset by 2.98
      track.applyChunk(1, [tok("", 0, 0.1), tok("I", 0.1, 0.4)]);
      track.applyChunk(1, [tok(".", 2.61, 2.65)]);
      track.applyChunk(1, EMPTY);

      const sentences = track.getSentences();
      expect(sentences).toHaveLength(2);

      expect(sentences[0]!.start).toBeCloseTo(0);
      expect(sentences[0]!.end).toBeCloseTo(2.98);

      expect(sentences[1]!.start).toBeCloseTo(2.98); // offset by sentence 1 end
      expect(sentences[1]!.end).toBeCloseTo(2.98 + 2.65);
    });

    it("handles the four-sentence example from Step 0 validation", () => {
      const track = createInworldSubtitleTrack();

      // Sentence 1 — "Welcome, dear friend, to the Council of Foods." (ends at 2.98)
      track.applyChunk(1, [tok("", 0, 0.1), tok("Welcome", 0.1, 0.5), tok(",", 0.5, 0.83)]);
      track.applyChunk(1, [tok("Foods", 2.45, 2.98)]);
      track.applyChunk(1, [tok(".", 2.98, 2.98)]);
      track.applyChunk(1, EMPTY);

      // Sentence 2 — "I am Water, and I am here to guide you." (ends at 2.65, offset 2.98)
      track.applyChunk(1, [tok("", 0, 0.1), tok("I", 0.1, 0.4)]);
      track.applyChunk(1, [tok(".", 2.61, 2.65)]);
      track.applyChunk(1, EMPTY);

      // Sentence 3 — "To speak with me..." (ends at 5.68, offset 2.98+2.65=5.63)
      track.applyChunk(1, [tok("", 0, 0.23), tok("To", 0.23, 0.35)]);
      track.applyChunk(1, [tok(".", 5.68, 5.68)]);
      track.applyChunk(1, EMPTY);

      // Sentence 4 — "Take your time, there's no rush." (ends at 1.81, offset 5.63+5.68=11.31)
      track.applyChunk(1, [tok("", 0, 0.09), tok("Take", 0.09, 0.26)]);
      track.applyChunk(1, [tok(".", 1.81, 1.81)]);
      track.applyChunk(1, EMPTY);

      const sentences = track.getSentences();
      expect(sentences).toHaveLength(4);
      expect(sentences[0]!.end).toBeCloseTo(2.98);
      expect(sentences[1]!.start).toBeCloseTo(2.98);
      expect(sentences[1]!.end).toBeCloseTo(2.98 + 2.65);
      expect(sentences[2]!.start).toBeCloseTo(2.98 + 2.65);
      expect(sentences[3]!.start).toBeCloseTo(2.98 + 2.65 + 5.68);
    });

    it("ignores content_index (always 1 on WebRTC)", () => {
      const track = createInworldSubtitleTrack();
      track.applyChunk(1, [tok("Hello", 0.1, 0.5)]);
      track.applyChunk(1, EMPTY);
      // Same result regardless of content_index value
      const track2 = createInworldSubtitleTrack();
      track2.applyChunk(99, [tok("Hello", 0.1, 0.5)]);
      track2.applyChunk(99, EMPTY);
      expect(track.getSentences()[0]!.text).toBe(track2.getSentences()[0]!.text);
    });

    it("discards buffer-only chunks that produce empty text", () => {
      const track = createInworldSubtitleTrack();
      track.applyChunk(1, [tok("", 0, 0.1), tok(" ", 0.1, 0.1)]);
      track.applyChunk(1, EMPTY);
      expect(track.getSentences()).toHaveLength(0);
    });
  });

  describe("reset", () => {
    it("clears all sentences and offset", () => {
      const track = createInworldSubtitleTrack();
      track.applyChunk(1, [tok("Hello", 0.1, 0.5)]);
      track.applyChunk(1, EMPTY);
      expect(track.getSentences()).toHaveLength(1);

      track.reset();
      expect(track.getSentences()).toHaveLength(0);

      // Offset should also reset: first sentence after reset starts at 0
      track.applyChunk(1, [tok("", 0, 0.1), tok("Hi", 0.1, 0.3)]);
      track.applyChunk(1, EMPTY);
      expect(track.getSentences()[0]!.start).toBeCloseTo(0);
    });
  });

  describe("getSentences immutability", () => {
    it("returns a copy — mutations do not affect internal state", () => {
      const track = createInworldSubtitleTrack();
      track.applyChunk(1, [tok("Hello", 0.1, 0.5)]);
      track.applyChunk(1, EMPTY);
      const first = track.getSentences();
      first.push({ text: "injected", start: 99, end: 100 });
      expect(track.getSentences()).toHaveLength(1);
    });
  });

  describe("getPlaybackEndSec", () => {
    it("returns null when the track is empty", () => {
      const track = createInworldSubtitleTrack();
      expect(track.getPlaybackEndSec()).toBeNull();
    });

    it("returns pending estimate before the sentence is flushed", () => {
      const track = createInworldSubtitleTrack();
      track.applyChunk(1, [tok("", 0, 0.1), tok("Hello", 0.1, 0.5)]);
      expect(track.getPlaybackEndSec()).toBeCloseTo(0.5);
    });

    it("returns flushed sentence end and grows with pending data", () => {
      const track = createInworldSubtitleTrack();
      track.applyChunk(1, [tok("", 0, 0.1), tok("First", 0.1, 0.5)]);
      track.applyChunk(1, EMPTY);
      track.applyChunk(1, [tok("", 0, 0.1), tok("Second", 0.1, 0.8)]);

      expect(track.getPlaybackEndSec()).toBeCloseTo(Math.max(0.5, 0.5 + 0.8));
    });

    it("returns the last flushed end when the buffer is empty", () => {
      const track = createInworldSubtitleTrack();
      track.applyChunk(1, [tok("Hi", 0.1, 0.4)]);
      track.applyChunk(1, EMPTY);
      expect(track.getPlaybackEndSec()).toBeCloseTo(0.4);
    });
  });
});

describe("findActiveSentenceAtTime", () => {
  const sentences = [
    { text: "First.", start: 0, end: 2.98 },
    { text: "Second.", start: 2.98, end: 5.63 },
    { text: "Third.", start: 5.63, end: 11.31 },
  ];

  it("returns null before any sentence starts", () => {
    expect(findActiveSentenceAtTime(sentences, -0.1)).toBeNull();
  });

  it("returns first sentence at its start time", () => {
    expect(findActiveSentenceAtTime(sentences, 0)!.text).toBe("First.");
  });

  it("returns second sentence once its start is reached", () => {
    expect(findActiveSentenceAtTime(sentences, 2.98)!.text).toBe("Second.");
    expect(findActiveSentenceAtTime(sentences, 4)!.text).toBe("Second.");
  });

  it("returns last sentence after its start even past its end (hold)", () => {
    expect(findActiveSentenceAtTime(sentences, 20)!.text).toBe("Third.");
  });

  it("returns null for empty sentences array", () => {
    expect(findActiveSentenceAtTime([], 5)).toBeNull();
  });
});

describe("computeInworldAgentSpeaking", () => {
  it("is false when the anchor is not set", () => {
    expect(computeInworldAgentSpeaking({
      anchorSet: false,
      playbackSec: 1,
      endSec: 5,
      responseCancelled: false,
    })).toBe(false);
  });

  it("is true when the anchor is set but endSec is unknown", () => {
    expect(computeInworldAgentSpeaking({
      anchorSet: true,
      playbackSec: 0,
      endSec: null,
      responseCancelled: false,
    })).toBe(true);
  });

  it("is true while playback is before endSec", () => {
    expect(computeInworldAgentSpeaking({
      anchorSet: true,
      playbackSec: 2,
      endSec: 5,
      responseCancelled: false,
    })).toBe(true);
  });

  it("is false once playback reaches endSec", () => {
    expect(computeInworldAgentSpeaking({
      anchorSet: true,
      playbackSec: 5,
      endSec: 5,
      responseCancelled: false,
    })).toBe(false);
  });

  it("is false when the response was cancelled", () => {
    expect(computeInworldAgentSpeaking({
      anchorSet: true,
      playbackSec: 1,
      endSec: null,
      responseCancelled: true,
    })).toBe(false);
  });
});
