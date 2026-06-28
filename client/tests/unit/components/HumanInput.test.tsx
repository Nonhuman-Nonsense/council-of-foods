import { describe, expect, it } from "vitest";
import {
  countTranscriptWords,
  formatTranscriptInputValue,
  scrollTextareaToBottom,
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
