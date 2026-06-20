import { describe, expect, it } from "vitest";
import {
  BUTTON_DOWN,
  BUTTON_UP,
  formatButtonCommand,
  parseButtonChunk,
  parseButtonLine,
} from "@shared/buttonProtocol";

describe("button protocol", () => {
  it("parses button lines", () => {
    expect(parseButtonLine("BUTTON_DOWN")).toEqual({ type: "button_down" });
    expect(parseButtonLine("BUTTON_UP")).toEqual({ type: "button_up" });
    expect(parseButtonLine("PONG")).toEqual({ type: "pong" });
  });

  it("parses chunked input", () => {
    const first = parseButtonChunk("BUTTON_DOWN\nBUTT");
    expect(first.events).toEqual([{ type: "button_down" }]);
    expect(first.rest).toBe("BUTT");

    const second = parseButtonChunk(`${first.rest}ON_UP\n`);
    expect(second.events).toEqual([{ type: "button_up" }]);
  });

  it("formats commands with newline", () => {
    expect(formatButtonCommand(BUTTON_DOWN)).toBe(`${BUTTON_DOWN}\n`);
    expect(formatButtonCommand(BUTTON_UP)).toBe(`${BUTTON_UP}\n`);
  });

  it("trims whitespace", () => {
    expect(parseButtonLine("  BUTTON_DOWN  ")).toEqual({ type: "button_down" });
  });
});
