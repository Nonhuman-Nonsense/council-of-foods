import { describe, expect, it } from "vitest";
import {
  countTranscriptWords,
  formatTranscriptInputValue,
  mergeTranscriptionDelta,
  scrollTextareaToBottom,
  stripRecordingEllipsis,
  transcriptionDeltaMergeModeForModel,
  transcriptSegmentKey,
  upsertTranscriptSegment,
  type TranscriptSegment,
} from "@council/humanInput/HumanInput";

describe("countTranscriptWords", () => {
  it("counts whitespace-separated words in trimmed text", () => {
    expect(countTranscriptWords("")).toBe(0);
    expect(countTranscriptWords("   ")).toBe(0);
    expect(countTranscriptWords("Hello")).toBe(1);
    expect(countTranscriptWords("Hello council")).toBe(2);
    expect(countTranscriptWords("  one   two   three  ")).toBe(3);
  });
});

describe("upsertTranscriptSegment", () => {
  it("keeps transcript segments in first-seen order", () => {
    let segments: TranscriptSegment[] = [];

    segments = upsertTranscriptSegment(segments, "item_z", "second sentence");
    segments = upsertTranscriptSegment(segments, "item_a", "first sentence");
    segments = upsertTranscriptSegment(segments, "item_z", "second sentence final");

    expect(segments).toEqual([
      { itemId: "item_z", text: "second sentence final" },
      { itemId: "item_a", text: "first sentence" },
    ]);
  });

  it("keeps separate segments for different content indices on the same item", () => {
    let segments: TranscriptSegment[] = [];

    segments = upsertTranscriptSegment(segments, transcriptSegmentKey("item_1", 0), "first part");
    segments = upsertTranscriptSegment(segments, transcriptSegmentKey("item_1", 1), "second part");

    expect(segments).toEqual([
      { itemId: "item_1", text: "first part" },
      { itemId: "item_1:1", text: "second part" },
    ]);
  });
});

describe("transcriptSegmentKey", () => {
  it("uses item id alone for the first content index", () => {
    expect(transcriptSegmentKey("item_1")).toBe("item_1");
    expect(transcriptSegmentKey("item_1", 0)).toBe("item_1");
  });

  it("suffixes non-zero content indices", () => {
    expect(transcriptSegmentKey("item_1", 1)).toBe("item_1:1");
  });
});

describe("mergeTranscriptionDelta", () => {
  it("appends incremental deltas in append mode", () => {
    expect(mergeTranscriptionDelta("append", "Hello", " dear")).toBe("Hello dear");
  });

  it("replaces with the current partial in replace mode", () => {
    expect(mergeTranscriptionDelta("replace", "I am say", "I am saying something")).toBe(
      "I am saying something",
    );
  });

  it("appends Soniox 1–2 token suffix chunks in adaptive mode", () => {
    expect(mergeTranscriptionDelta("adaptive", "Hej,", " nu")).toBe("Hej, nu");
    expect(mergeTranscriptionDelta("adaptive", "Hej, nu test", "ar")).toBe("Hej, nu testar");
    expect(mergeTranscriptionDelta("adaptive", "Den här", " å")).toBe("Den här å");
    expect(mergeTranscriptionDelta("adaptive", "Den här å", "nd")).toBe("Den här ånd");
    expect(mergeTranscriptionDelta("adaptive", "Den här ånd", "en")).toBe("Den här ånden");
  });

  it("replaces Soniox 3+-word snapshots regardless of first-word match", () => {
    // first word same
    expect(
      mergeTranscriptionDelta("adaptive", "Och nu ska vi.", "Och nu ska vi se en tredje gång, ska"),
    ).toBe("Och nu ska vi se en tredje gång, ska");

    // first word DIFFERENT — the key case prefix heuristics fail on
    expect(
      mergeTranscriptionDelta("adaptive", "En här ånden", "Den här hunden, ni kan"),
    ).toBe("Den här hunden, ni kan");

    // first token was wrong word, snapshot corrects and extends
    expect(
      mergeTranscriptionDelta("adaptive", "Den här ånden", "Den här hunden, ni kan"),
    ).toBe("Den här hunden, ni kan");
  });

  it("replaces when delta is a forward extension of existing", () => {
    expect(
      mergeTranscriptionDelta("adaptive", "Den här hunden", "Den här hunden, ni kan se"),
    ).toBe("Den här hunden, ni kan se");
  });

  it("does not double-append when existing already ends with delta", () => {
    expect(mergeTranscriptionDelta("adaptive", "Hej nu", "nu")).toBe("Hej nu");
  });

  it("replays the full mixed suffix+snapshot stream from live log without stacking", () => {
    // Exact delta sequence from 2026-06-30 production log
    const deltas = [
      "Den", " här", " å", "nd", "en",
      "Den här hunden, ni kan",    // 4-word snapshot: ånden→hunden, extends
      " se", " att", " jag", " tar", " in", " den", " till", " och",
      "Den här hunden, ni kan se att jag har tagit en till och se",  // snapshot: tar in→har tagit
      " om", " det",
      "Den här hunden, ni kan se att jag tar in den till och se om det",  // snapshot revises again
      " fun", "kar", ".",
    ];

    let text = "";
    for (const delta of deltas) {
      text = mergeTranscriptionDelta("adaptive", text, delta);
    }

    expect(text).toBe(
      "Den här hunden, ni kan se att jag tar in den till och se om det funkar.",
    );
  });
});

describe("transcriptionDeltaMergeModeForModel", () => {
  it("uses adaptive merge for Soniox and replace for AssemblyAI", () => {
    expect(transcriptionDeltaMergeModeForModel("soniox/stt-rt-v4")).toBe("adaptive");
    expect(transcriptionDeltaMergeModeForModel("assemblyai/u3-rt-pro")).toBe("replace");
  });
});

describe("stripRecordingEllipsis", () => {
  it("removes the live recording suffix before persisting max-length text", () => {
    expect(stripRecordingEllipsis("hello world...")).toBe("hello world");
    expect(stripRecordingEllipsis("hello world")).toBe("hello world");
  });
});

describe("formatTranscriptInputValue", () => {
  it("renders transcript segments without sorting provider item IDs", () => {
    const value = formatTranscriptInputValue({
      previousTranscript: "existing text",
      transcriptSegments: [
        { itemId: "item_z", text: "first live sentence" },
        { itemId: "item_a", text: "second live sentence" },
      ],
      isRecording: true,
      maxLength: 200,
    });

    expect(value).toBe("existing text first live sentence second live sentence...");
  });

  it("never writes past the textarea max length", () => {
    const value = formatTranscriptInputValue({
      previousTranscript: "1234567890",
      transcriptSegments: [{ itemId: "item_1", text: "abcdef" }],
      isRecording: true,
      maxLength: 12,
    });

    expect(value).toHaveLength(12);
    expect(value).toBe("1234567890 a");
  });
});

describe("scrollTextareaToBottom", () => {
  it("scrolls to the textarea scroll height", () => {
    const textarea = document.createElement("textarea");

    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      value: 1234,
    });

    scrollTextareaToBottom(textarea);

    expect(textarea.scrollTop).toBe(1234);
  });
});

