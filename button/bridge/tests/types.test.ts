import { describe, expect, it } from "vitest";
import { parseClientMessage } from "../src/types.js";

describe("parseClientMessage", () => {
  it("accepts write messages", () => {
    expect(parseClientMessage(JSON.stringify({ type: "write", line: "LED_PULSE" }))).toEqual({
      type: "write",
      line: "LED_PULSE",
    });
  });

  it("rejects invalid payloads", () => {
    expect(parseClientMessage("not json")).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "ping" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "write", line: "" }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "write", line: "x".repeat(33) }))).toBeNull();
  });
});
