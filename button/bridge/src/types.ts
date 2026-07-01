export const BRIDGE_VERSION = "1.0.0";

export type SerialStatusState = "connected" | "disconnected";

export type ServerMessage =
  | { type: "info"; version: string }
  | { type: "status"; state: SerialStatusState; path?: string; error?: string }
  | { type: "line"; text: string };

export type ClientMessage = { type: "write"; line: string };

export function parseClientMessage(raw: string): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (
    typeof parsed === "object" &&
    parsed != null &&
    "type" in parsed &&
    parsed.type === "write" &&
    "line" in parsed &&
    typeof parsed.line === "string" &&
    parsed.line.length > 0 &&
    parsed.line.length <= 32
  ) {
    return { type: "write", line: parsed.line };
  }
  return null;
}

export function serializeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}
