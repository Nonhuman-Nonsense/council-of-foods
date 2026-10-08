/**
 * The client log the browser sends to `POST /api/client-log` when "Send log to server" is on
 * in #staff. It is exactly what the console prints, batched: tuning what gets stored means
 * tuning the log calls, not this format.
 *
 * The endpoint is open, so the server accepts only batches shaped exactly like these. The
 * limits live here so the client never builds a batch the server would turn away.
 */

export const LOG_CATEGORIES = [
    "API",
    "SOCKET",
    "AGENT",
    "REALTIME",
    "TURN",
    "BUTTON",
    "META",
    "AUTOPLAY",
    "PRINT",
    "SYSTEM",
    "ERROR",
] as const;

export type LogCategory = (typeof LOG_CATEGORIES)[number];

/** What a line was logged during: the visitor's setup, then the meeting it led to. */
export interface ClientLogContext {
    setupId?: string;
    meetingId?: number;
}

export interface ClientLogLine {
    /** Client clock, ms since the epoch. */
    t: number;
    cat: LogCategory;
    msg: string;
    /** The logged payload, already shortened the way the console shortens it. */
    data?: unknown;
    ctx?: ClientLogContext;
}

export interface ClientLogBatch {
    /** Random per page load: one kiosk session from load to reload. */
    pageId: string;
    /** Batch number within the page load, from 0. A gap means a batch was lost. */
    seq: number;
    /** Venue chosen on #staff, if any. */
    venueId?: string;
    /** Lines thrown away since the last batch that arrived (buffer full while offline). */
    dropped?: number;
    lines: ClientLogLine[];
}

export const CLIENT_LOG_LIMITS = {
    /** Lines in one batch. */
    maxLines: 500,
    /**
     * Serialised batch size. Kept under the server's JSON body limit (100 kB) and the
     * browser's 64 kB `keepalive` budget, so a batch sent as the page closes still arrives.
     */
    maxBatchBytes: 60_000,
    maxMessageChars: 500,
    /** Serialised `data` of one line. */
    maxDataChars: 8_000,
    maxIdChars: 64,
    /** How far a line's clock may be from the server's before the batch is refused. */
    maxClockSkewMs: 7 * 24 * 60 * 60 * 1000,
} as const;
