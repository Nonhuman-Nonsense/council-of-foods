export const PTT_BAUD_RATE = 115200;

export const PTT_DOWN = "PTT_DOWN";
export const PTT_UP = "PTT_UP";
export const LED_ON = "LED_ON";
export const LED_OFF = "LED_OFF";
export const PING = "PING";
export const PONG = "PONG";

export type ParsedSerialLine =
  | { type: "ptt_down" }
  | { type: "ptt_up" }
  | { type: "pong" }
  | { type: "unknown"; line: string };

export function formatSerialCommand(command: string): string {
  return `${command}\n`;
}

export function parseSerialLine(raw: string): ParsedSerialLine | null {
  const line = raw.trim();
  if (!line) return null;
  switch (line) {
    case PTT_DOWN:
      return { type: "ptt_down" };
    case PTT_UP:
      return { type: "ptt_up" };
    case PONG:
      return { type: "pong" };
    default:
      return { type: "unknown", line };
  }
}

export function parseSerialChunk(buffer: string): { events: ParsedSerialLine[]; rest: string } {
  const events: ParsedSerialLine[] = [];
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    const parsed = parseSerialLine(part);
    if (parsed) events.push(parsed);
  }
  return { events, rest };
}
