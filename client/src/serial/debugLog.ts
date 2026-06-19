export const SERIAL_DEBUG_LOG_EVENT = "serial-debug-log";

const MAX_ENTRIES = 300;

export type SerialDebugLogLevel = "info" | "warn" | "error";

export type SerialDebugLogEntry = {
  ts: string;
  level: SerialDebugLogLevel;
  source: string;
  message: string;
  detail?: string;
};

const entries: SerialDebugLogEntry[] = [];

function serializeDetail(detail: unknown): string | undefined {
  if (detail === undefined) {
    return undefined;
  }
  if (detail instanceof Error) {
    return JSON.stringify({
      name: detail.name,
      message: detail.message,
      stack: detail.stack,
    });
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

function emitLog(entry: SerialDebugLogEntry): void {
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.shift();
  }

  const prefix = `[TalkButton/${entry.source}]`;
  const suffix = entry.detail ? ` ${entry.detail}` : "";
  if (entry.level === "error") {
    console.error(`${prefix} ${entry.message}${suffix}`);
  } else if (entry.level === "warn") {
    console.warn(`${prefix} ${entry.message}${suffix}`);
  } else {
    console.log(`${prefix} ${entry.message}${suffix}`);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SERIAL_DEBUG_LOG_EVENT));
  }
}

export function serialDebugLog(
  source: string,
  message: string,
  detail?: unknown,
  level: SerialDebugLogLevel = "info",
): void {
  emitLog({
    ts: new Date().toISOString(),
    level,
    source,
    message,
    detail: serializeDetail(detail),
  });
}

export function serialDebugLogError(
  source: string,
  message: string,
  error: unknown,
): void {
  serialDebugLog(source, message, error, "error");
}

export function getSerialDebugLogEntries(): readonly SerialDebugLogEntry[] {
  return entries;
}

export function getSerialDebugLogText(): string {
  return entries
    .map((entry) => {
      const detail = entry.detail ? ` | ${entry.detail}` : "";
      return `${entry.ts} [${entry.level}] ${entry.source}: ${entry.message}${detail}`;
    })
    .join("\n");
}

export function clearSerialDebugLog(): void {
  entries.length = 0;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SERIAL_DEBUG_LOG_EVENT));
  }
}
