/**
 * Sends what the console logs to the server as well, so a kiosk's log can be read after the
 * fact (`npm run logs` on the server). On only while #staff → Logging → "Send log to server"
 * is on; the logger hands over exactly the lines it prints, already shortened.
 *
 * Lines are batched every few seconds rather than sent one by one, and kept while the server
 * is unreachable — up to a cap, past which the oldest go and the next batch says how many.
 * Sending never logs anything itself: a failing send would otherwise feed its own queue.
 */

import {
  CLIENT_LOG_LIMITS,
  type ClientLogBatch,
  type ClientLogContext,
  type ClientLogLine,
  type LogCategory,
} from "@shared/ClientLogTypes";
import { getServerLogEnabled, getVenueId } from "@/settings/councilSettings";

export const CLIENT_LOG_PATH = "/api/client-log";
/** How often a batch goes out while there is something to send. */
export const SERVER_LOG_FLUSH_MS = 5_000;
/** An error is what someone reads the log for: send it, and what led up to it, promptly. */
export const SERVER_LOG_ERROR_FLUSH_MS = 500;
/** Wait after a failed send before trying again. */
export const SERVER_LOG_RETRY_MS = 30_000;
/** Lines kept while the server can't be reached — some minutes of a busy kiosk. */
export const MAX_QUEUED_LINES = 5_000;

/** Room for the batch's own fields around its lines. */
const BATCH_OVERHEAD_BYTES = 300;

export type ServerLogStatus = {
  /** Lines waiting to be sent. */
  pending: number;
  /** Lines the server has taken since the page loaded. */
  sentLines: number;
  lastSentAt: number | null;
  /** Why the last send failed, until one succeeds: the HTTP status, or "network". */
  failure: string | null;
};

type QueuedLine = { line: ClientLogLine; bytes: number };

let pageId = newPageId();
let context: ClientLogContext = {};
let queue: QueuedLine[] = [];
let dropped = 0;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let timerDueAt = 0;
let sending = false;
let sentLines = 0;
let lastSentAt: number | null = null;
let failure: string | null = null;

function newPageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Insecure contexts have no randomUUID; the server only needs the same shape.
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}

/** UTF-8 length — what the body limit counts. Swedish letters are two bytes each. */
function utf8Bytes(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** The payload as the server will accept it: JSON, and no bigger than one line may carry. */
function fitData(data: unknown): unknown {
  if (data === undefined) return undefined;
  let json: string | undefined;
  try {
    json = JSON.stringify(data);
  } catch {
    return { unserializable: clip(String(data), 200) };
  }
  if (json === undefined) return undefined;
  if (json.length <= CLIENT_LOG_LIMITS.maxDataChars) return data;
  return { truncated: clip(json, CLIENT_LOG_LIMITS.maxDataChars - 100) };
}

/** Whether lines are being collected for the server right now. */
export function isServerLogOn(): boolean {
  return typeof window !== "undefined" && getServerLogEnabled();
}

/**
 * Tag the lines that follow with the visit they belong to. Pass `undefined` to drop a field
 * (the setup ended, the meeting closed).
 */
export function setLogContext(patch: Partial<ClientLogContext>): void {
  const next: ClientLogContext = { ...context, ...patch };
  for (const key of Object.keys(next) as Array<keyof ClientLogContext>) {
    if (next[key] === undefined) delete next[key];
  }
  context = next;
}

/** Queue one printed line. Called by the logger for every line it prints. */
export function pushServerLogLine(category: LogCategory, message: string, data?: unknown): void {
  if (!isServerLogOn()) return;

  const line: ClientLogLine = {
    t: Date.now(),
    cat: category,
    msg: clip(message, CLIENT_LOG_LIMITS.maxMessageChars),
  };
  const fitted = fitData(data);
  if (fitted !== undefined) line.data = fitted;
  if (Object.keys(context).length > 0) line.ctx = { ...context };

  queue.push({ line, bytes: utf8Bytes(JSON.stringify(line)) });
  if (queue.length > MAX_QUEUED_LINES) {
    const over = queue.length - MAX_QUEUED_LINES;
    queue.splice(0, over);
    dropped += over;
  }
  scheduleFlush(category === "ERROR" ? SERVER_LOG_ERROR_FLUSH_MS : SERVER_LOG_FLUSH_MS);
}

/** Send no later than `delayMs` from now. An earlier send already planned stands. */
function scheduleFlush(delayMs: number): void {
  const dueAt = Date.now() + delayMs;
  if (timer != null && timerDueAt <= dueAt) return;
  if (timer != null) clearTimeout(timer);
  timerDueAt = dueAt;
  timer = setTimeout(() => {
    timer = null;
    void flushServerLog();
  }, delayMs);
}

/** The oldest lines that fit in one batch: at least one, within the line and byte limits. */
function takeBatchLines(): QueuedLine[] {
  const budget = CLIENT_LOG_LIMITS.maxBatchBytes - BATCH_OVERHEAD_BYTES;
  let bytes = 0;
  let count = 0;
  while (count < queue.length && count < CLIENT_LOG_LIMITS.maxLines) {
    const next = queue[count].bytes + 1;
    if (count > 0 && bytes + next > budget) break;
    bytes += next;
    count++;
  }
  return queue.splice(0, count);
}

/** Put lines that did not get through back at the front, still within the cap. */
function requeue(lines: QueuedLine[]): void {
  queue = [...lines, ...queue];
  if (queue.length > MAX_QUEUED_LINES) {
    const over = queue.length - MAX_QUEUED_LINES;
    queue.splice(0, over);
    dropped += over;
  }
}

/** Send one batch now, if there is anything to send and nothing already on its way. */
export async function flushServerLog(): Promise<void> {
  if (sending) return;
  if (!isServerLogOn()) {
    // Switched off: what was queued is no longer wanted.
    queue = [];
    dropped = 0;
    return;
  }
  if (queue.length === 0) return;

  const taken = takeBatchLines();
  const droppedBefore = dropped;
  const venueId = getVenueId();
  const batch: ClientLogBatch = {
    pageId,
    seq,
    ...(venueId ? { venueId } : {}),
    ...(droppedBefore > 0 ? { dropped: droppedBefore } : {}),
    lines: taken.map((entry) => entry.line),
  };

  sending = true;
  try {
    const response = await fetch(CLIENT_LOG_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
      // Lets the last batch out as the page closes.
      keepalive: true,
    });
    if (response.ok) {
      seq += 1;
      dropped -= droppedBefore;
      sentLines += taken.length;
      lastSentAt = Date.now();
      failure = null;
    } else if (response.status === 400) {
      // The server does not accept these lines; sending them again will not change that.
      failure = "400";
      dropped += taken.length;
    } else {
      failure = String(response.status);
      requeue(taken);
    }
  } catch {
    failure = "network";
    requeue(taken);
  } finally {
    sending = false;
  }

  if (queue.length > 0) {
    scheduleFlush(failure && failure !== "400" ? SERVER_LOG_RETRY_MS : SERVER_LOG_ERROR_FLUSH_MS);
  }
}

/** This page load's id, as the stored log knows it (`npm run logs -- --page <id>`). */
export function getLogPageId(): string {
  return pageId;
}

export function getServerLogStatus(): ServerLogStatus {
  return { pending: queue.length, sentLines, lastSentAt, failure };
}

/** Send what is left when the page goes away or into the background. Call once at startup. */
export function installServerLogSink(): void {
  if (typeof window === "undefined") return;
  const flushNow = () => {
    void flushServerLog();
  };
  window.addEventListener("pagehide", flushNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushNow();
  });
}

/** Test seam: forget everything, as if the page had just loaded. */
export function resetServerLogSinkForTests(): void {
  if (timer != null) clearTimeout(timer);
  timer = null;
  timerDueAt = 0;
  pageId = newPageId();
  context = {};
  queue = [];
  dropped = 0;
  seq = 0;
  sending = false;
  sentLines = 0;
  lastSentAt = null;
  failure = null;
}
