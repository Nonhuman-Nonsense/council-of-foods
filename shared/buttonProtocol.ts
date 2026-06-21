export const BUTTON_BAUD_RATE = 115200;

export const BUTTON_DOWN = "BUTTON_DOWN";
export const BUTTON_UP = "BUTTON_UP";
export const LED_ON = "LED_ON";
export const LED_OFF = "LED_OFF";
export const LED_PULSE = "LED_PULSE";
export const HELLO_COUNCIL = "HELLO_COUNCIL";
export const READY_COUNCIL_BUTTON = "READY council-button";

export function isReadyCouncilButton(line: string): boolean {
  return line.trim() === READY_COUNCIL_BUTTON;
}

export type ParsedButtonLine =
  | { type: "button_down" }
  | { type: "button_up" }
  | { type: "ready" }
  | { type: "unknown"; line: string };

export function formatButtonCommand(command: string): string {
  return `${command}\n`;
}

export function parseButtonLine(raw: string): ParsedButtonLine | null {
  const line = raw.trim();
  if (!line) return null;
  switch (line) {
    case BUTTON_DOWN:
      return { type: "button_down" };
    case BUTTON_UP:
      return { type: "button_up" };
    default:
      if (isReadyCouncilButton(line)) {
        return { type: "ready" };
      }
      return { type: "unknown", line };
  }
}

export function parseButtonChunk(buffer: string): { events: ParsedButtonLine[]; rest: string } {
  const events: ParsedButtonLine[] = [];
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    const parsed = parseButtonLine(part);
    if (parsed) events.push(parsed);
  }
  return { events, rest };
}
