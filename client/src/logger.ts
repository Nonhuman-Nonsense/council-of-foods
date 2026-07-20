import {
  getDevLogEnabled,
  isDevLogCategoryEnabled,
} from "@/settings/councilSettings";

export const DEV_LOG_CATEGORIES = [
  "API",
  "SOCKET",
  "AGENT",
  "REALTIME",
  "TURN",
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

const CATEGORY_STYLE: Record<LogCategory, string> = {
  API: "color: #d97706; font-weight: bold;",
  SOCKET: "color: #3b82f6; font-weight: bold;",
  AGENT: "color: #8b5cf6; font-weight: bold;",
  REALTIME: "color: #0891b2; font-weight: bold;",
  TURN: "color: #16a34a; font-weight: bold;",
  BUTTON: "color: #10b981; font-weight: bold;",
  META: "color: #ec4899; font-weight: bold;",
  AUTOPLAY: "color: #f59e0b; font-weight: bold;",
  SYSTEM: "color: #6b7280; font-weight: bold;",
  ERROR: "color: #ef4444; font-weight: bold;",
};

const CATEGORY_ICON: Record<LogCategory, string> = {
  API: "🌐",
  SOCKET: "⬇️",
  AGENT: "🔧",
  REALTIME: "🎙️",
  TURN: "🔄",
  BUTTON: "🔘",
  META: "🪑",
  AUTOPLAY: "🔁",
  SYSTEM: "⚙️",
  ERROR: "❌",
};

function truncateString(value: string, max = LOG_STRING_MAX): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}… (${value.length} chars)`;
}

/** Shrink large payloads for console groups without dumping megabytes. */
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

function shouldLog(category: LogCategory): boolean {
  if (!getDevLogEnabled()) return false;
  return isDevLogCategoryEnabled(category);
}

function mirrorErrorToConsole(message: string, data?: unknown): void {
  const prefix = `[Council] ${message}`;
  if (data instanceof Error) {
    console.error(prefix, data);
    return;
  }
  if (data !== undefined) {
    console.error(prefix, data);
    return;
  }
  console.error(prefix);
}

function emitStructuredLog(category: LogCategory, message: string, data?: unknown): void {
  const style = CATEGORY_STYLE[category] ?? "font-weight: bold;";
  const icon = CATEGORY_ICON[category] ?? "🔹";
  const label = `${icon} [${category}] ${message}`;
  const write = category === "ERROR" ? console.error.bind(console) : console.log.bind(console);

  if (data === undefined) {
    write(`%c${label}`, style);
    return;
  }

  console.groupCollapsed(`%c${label}`, style);
  write(data);
  console.groupEnd();
}

/**
 * Structured console log for staff debugging. Gated by `#staff` logging toggles.
 *
 * ERROR is additive in dev: failures mirror to `console.error` when structured
 * ERROR logging is off. Other categories are optional styled groups only.
 */
export function logEvent(category: LogCategory, message: string, data?: unknown): void {
  if (category === "ERROR") {
    if (shouldLog("ERROR")) {
      emitStructuredLog("ERROR", message, data);
    } else if (import.meta.env.DEV) {
      mirrorErrorToConsole(message, data);
    }
    return;
  }

  if (!shouldLog(category)) return;
  emitStructuredLog(category, message, data);
}

/** Single-line log for easy copy/paste (no collapsed groups). */
export function logEventFlat(category: LogCategory, message: string, data?: unknown): void {
  if (category === "ERROR") {
    if (shouldLog("ERROR")) {
      const style = CATEGORY_STYLE.ERROR;
      const icon = CATEGORY_ICON.ERROR;
      const payload =
        data === undefined ? "" : ` ${JSON.stringify(summarizeLogPayload(data))}`;
      console.error(`%c${icon} [${category}] ${message}${payload}`, style);
    } else if (import.meta.env.DEV) {
      mirrorErrorToConsole(message, data);
    }
    return;
  }

  if (!shouldLog(category)) return;

  const style = CATEGORY_STYLE[category] ?? "font-weight: bold;";
  const icon = CATEGORY_ICON[category] ?? "🔹";
  const payload = data === undefined ? "" : ` ${JSON.stringify(summarizeLogPayload(data))}`;
  console.log(`%c${icon} [${category}] ${message}${payload}`, style);
}

export const log = {
  event: logEvent,
  flat: logEventFlat,
};

function serializeClientCause(cause: unknown): unknown {
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message, stack: cause.stack };
  }
  return cause;
}

export type ClientReportSeverity = "info" | "warning" | "error" | "critical";
export type ClientReportImpact = "none" | "notified" | "terminal" | "process_exit";

export interface ClientReportMeta {
  meetingId?: number;
  /** Defaults to 'critical' server-side when omitted — used for genuinely app-ending failures. */
  severity?: ClientReportSeverity;
  /** Defaults to 'terminal' server-side when omitted. */
  clientImpact?: ClientReportImpact;
}

function postClientReport(
  source: string,
  message: string,
  cause?: unknown,
  meta?: ClientReportMeta,
): void {
  if (!import.meta.env.PROD || typeof window === "undefined") return;

  void fetch("/api/client-report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      source,
      meetingId: meta?.meetingId,
      severity: meta?.severity,
      clientImpact: meta?.clientImpact,
      url: window.location.href,
      cause: cause === undefined ? undefined : serializeClientCause(cause),
    }),
    keepalive: true,
  }).catch(() => undefined);
}

/** Terminal client failures: Errorbot relay in prod + optional structured console log. */
export function reportTerminalError(
  source: string,
  message: string,
  cause?: unknown,
  meta?: ClientReportMeta,
): void {
  postClientReport(source, message, cause, meta);
  logEvent("ERROR", source, { message, cause, ...meta });
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as Window & { __councilLogger?: typeof log }).__councilLogger = log;
}

// Known-harmless noise injected by host environments, not bugs in our code — e.g. an
// in-app browser's (Instagram/TikTok/Facebook) native bridge script throwing because its
// own window.webkit.messageHandlers object isn't present in this context.
const WINDOW_ERROR_NOISE_PATTERNS: RegExp[] = [/webkit\.messageHandlers/i];

// Caps how many distinct window-level errors get reported per page load, and skips exact
// repeats — protects against a broken interval/loop flooding the report endpoint, since
// these fire on arbitrary uncaught errors anywhere on the page rather than a bounded set
// of app call sites.
const MAX_WINDOW_ERROR_REPORTS = 10;
let windowErrorReportCount = 0;
const reportedWindowErrorMessages = new Set<string>();

function shouldReportWindowError(message: string): boolean {
  if (WINDOW_ERROR_NOISE_PATTERNS.some((pattern) => pattern.test(message))) return false;
  if (reportedWindowErrorMessages.has(message)) return false;
  if (windowErrorReportCount >= MAX_WINDOW_ERROR_REPORTS) return false;
  reportedWindowErrorMessages.add(message);
  windowErrorReportCount++;
  return true;
}

/**
 * Report-only: these fire on plenty of benign noise (cancelled fetches, third-party
 * scripts), so unlike ErrorBoundary they don't set unrecoverableError / crash the UI, and
 * report at 'warning'/'none' rather than the 'critical'/'terminal' used for genuine crashes —
 * we don't know whether the page was actually affected. Call once at app startup.
 */
export function installGlobalErrorHandlers(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("error", (event) => {
    const message = event.message || "Uncaught error";
    if (!shouldReportWindowError(message)) return;
    reportTerminalError("window.onerror", message, event.error, {
      severity: "warning",
      clientImpact: "none",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason);
    if (!shouldReportWindowError(message)) return;
    reportTerminalError("unhandledrejection", message, reason, {
      severity: "warning",
      clientImpact: "none",
    });
  });
}
