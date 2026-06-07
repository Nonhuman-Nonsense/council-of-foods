import { describe, it, expect } from "vitest";
import {
  parseSerialChunk,
  parseSerialLine,
  formatSerialCommand,
  PTT_DOWN,
  PTT_UP,
  LED_ON,
  LED_PULSE,
} from "@/serial/protocol";

describe("serial protocol", () => {
  it("parses known serial lines", () => {
    expect(parseSerialLine("PTT_DOWN")).toEqual({ type: "ptt_down" });
    expect(parseSerialLine("PTT_UP")).toEqual({ type: "ptt_up" });
    expect(parseSerialLine("PONG")).toEqual({ type: "pong" });
  });

  it("parses chunked input", () => {
    const first = parseSerialChunk("PTT_DOWN\nPTT");
    expect(first.events).toEqual([{ type: "ptt_down" }]);
    expect(first.rest).toBe("PTT");

    const second = parseSerialChunk(`${first.rest}_UP\n`);
    expect(second.events).toEqual([{ type: "ptt_up" }]);
    expect(second.rest).toBe("");
  });

  it("formats commands with newline", () => {
    expect(formatSerialCommand(PTT_DOWN)).toBe(`${PTT_DOWN}\n`);
    expect(formatSerialCommand(LED_ON)).toBe(`${LED_ON}\n`);
    expect(formatSerialCommand(LED_PULSE)).toBe(`${LED_PULSE}\n`);
  });

  it("trims whitespace and ignores empty lines", () => {
    expect(parseSerialLine("  PTT_DOWN  ")).toEqual({ type: "ptt_down" });
    expect(parseSerialLine("")).toBeNull();
    expect(parseSerialLine("   ")).toBeNull();
  });

  it("returns unknown for unrecognized lines", () => {
    expect(parseSerialLine("DEBUG: hello")).toEqual({
      type: "unknown",
      line: "DEBUG: hello",
    });
  });
});
