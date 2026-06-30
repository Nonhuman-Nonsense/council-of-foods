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
});

describe("transcriptionDeltaMergeModeForModel", () => {
  it("appends for Soniox and replaces for AssemblyAI", () => {
    expect(transcriptionDeltaMergeModeForModel("soniox/stt-rt-v4")).toBe("append");
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
