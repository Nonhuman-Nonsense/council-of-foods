export const DEV_LOG_CATEGORIES = [
  "API",
  "SOCKET",
  "AGENT",
  "REALTIME",
  "BUTTON",
  "META",
  "AUTOPLAY",
  "SYSTEM",
  "ERROR",
] as const;

export type LogCategory = (typeof DEV_LOG_CATEGORIES)[number];

const LOG_STRING_MAX = 240;
const LOG_ARRAY_MAX = 12;
const LOG_DEPTH_MAX = 5;

const BLOB_FIELD_NAMES = new Set([
  "audioBase64",
  "audio",
  "sdp",
  "instructions",
]);

function truncateString(value: string, max = LOG_STRING_MAX): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}… (${value.length} chars)`;
}

/** Shrink large payloads for dev console groups without dumping megabytes. */
export function summarizeLogPayload(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= LOG_DEPTH_MAX) return "[…]";
  if (Array.isArray(value)) {
    if (value.length === 0) return [];
    const head = value
      .slice(0, LOG_ARRAY_MAX)
      .map((item) => summarizeLogPayload(item, depth + 1));
    if (value.length > LOG_ARRAY_MAX) {
      return [...head, `…+${value.length - LOG_ARRAY_MAX} more`];
    }
    return head;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (
        BLOB_FIELD_NAMES.has(key) &&
        typeof nested === "string" &&
        nested.length > LOG_STRING_MAX
      ) {
        out[key] = `[${key} ${nested.length} chars]`;
        continue;
      }
      out[key] = summarizeLogPayload(nested, depth + 1);
    }
    return out;
  }
  return String(value);
}

function serializeClientCause(cause: unknown): unknown {
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message, stack: cause.stack };
  }
  return cause;
}

function postClientReport(
  source: string,
  message: string,
  cause?: unknown,
  meta?: { meetingId?: number },
): void {
  if (!import.meta.env.PROD || typeof window === "undefined") return;

  void fetch("/api/client-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      source,
      meetingId: meta?.meetingId,
      url: window.location.href,
      cause: cause === undefined ? undefined : serializeClientCause(cause),
    }),
    keepalive: true,
  }).catch(() => undefined);
}

/** Production Errorbot relay for terminal client failures. */
export function reportTerminalError(
  source: string,
  message: string,
  cause?: unknown,
  meta?: { meetingId?: number },
): void {
  postClientReport(source, message, cause, meta);
}

export function logEvent(_category: LogCategory, _message: string, _data?: unknown): void {
  // production / vitest no-op
}

export const log = {
  event: logEvent,
};
