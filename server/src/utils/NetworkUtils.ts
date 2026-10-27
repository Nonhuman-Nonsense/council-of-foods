import { Logger } from "@utils/Logger.js";

const DEFAULT_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

/**
 * The one status our providers document as "wait and try again": a rate or
 * concurrency limit. Every in-flight generation counts against one
 * account-wide pool, so a busy meeting can race itself into one.
 */
const RATE_LIMITED_STATUS = 429;

/**
 * Statuses worth another attempt. 429 is the documented one; 503 is ours, on
 * the grounds that "service unavailable" is never a fault in the request we
 * sent. Everything else — auth, bad request, and a generic 500 — fails again
 * on the next try, so it is surfaced immediately (Inworld's own retry guidance
 * returns every non-429 status straight to the caller).
 */
const RETRYABLE_HTTP_STATUSES = new Set([RATE_LIMITED_STATUS, 503]);

const HTTP_RETRY_BASE_MS = 1000;
const HTTP_RETRY_MAX_MS = 16_000;

/** Shared timeout for outbound HTTP calls to external APIs (OpenAI, Inworld, etc.). */
export const OUTBOUND_HTTP_TIMEOUT_MS = 30_000;

const RETRYABLE_MESSAGES = new Set(["terminated"]);

const RETRYABLE_CODES = new Set([
    "UND_ERR_SOCKET",
    "UND_ERR_CONNECT_TIMEOUT",
    "ECONNRESET",
    "ETIMEDOUT",
    "ENOTFOUND",
    "ECONNREFUSED",
    "EAI_AGAIN",
    "EPIPE",
]);

/**
 * A non-OK response from an upstream API.
 *
 * Thrown from *inside* the function {@link withNetworkRetry} wraps, so the
 * status is part of the retry decision: a `response.ok` check placed after the
 * wrapper produces a failure the retry never sees, which is how a lost
 * capacity race used to become a hard error on the first attempt.
 */
export class UpstreamHttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
        /** From a `Retry-After` header, when the upstream sent one. */
        readonly retryAfterMs?: number,
    ) {
        super(message);
        this.name = "UpstreamHttpError";
    }

    /** Transient (over capacity / temporarily unavailable) rather than a real refusal. */
    get retryable(): boolean {
        return RETRYABLE_HTTP_STATUSES.has(this.status);
    }
}

/**
 * Did this fail because we lost a race for the account's capacity?
 *
 * Deliberately narrower than {@link UpstreamHttpError.retryable}: callers
 * degrade on this (drop one piece of work and carry on), and degrading is only
 * right when the provider is *busy*. A 503 is retried like a rate limit but
 * answers false here — a provider that is actually down should surface as a
 * failure rather than quietly hollowing out everything that depends on it.
 */
export function isCapacityError(error: unknown): boolean {
    return error instanceof UpstreamHttpError && error.status === RATE_LIMITED_STATUS;
}

function parseRetryAfterMs(header: string | null | undefined): number | undefined {
    if (!header) return undefined;
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(header);
    return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/**
 * Build an {@link UpstreamHttpError} from a non-OK response, consuming the body
 * for the message. `label` names the API being called ("Inworld TTS").
 */
export async function upstreamHttpError(response: Response, label: string): Promise<UpstreamHttpError> {
    const text = await response.text().catch(() => "");
    return new UpstreamHttpError(
        response.status,
        `${label} API Error: ${response.status} ${text}`,
        parseRetryAfterMs(response.headers?.get?.("retry-after")),
    );
}

type ErrorLike = {
    message?: string;
    code?: string | number;
    cause?: unknown;
};

function asErrorLike(error: unknown): ErrorLike | null {
    if (!error || typeof error !== "object") {
        return null;
    }
    return error as ErrorLike;
}

function isRetryableNode(node: ErrorLike): boolean {
    if (node.message && RETRYABLE_MESSAGES.has(node.message)) {
        return true;
    }
    if (node.code !== undefined && RETRYABLE_CODES.has(String(node.code))) {
        return true;
    }
    return false;
}

/** Walk error.cause up to two levels looking for transient network signals. */
export function isRetryableNetworkError(error: unknown): boolean {
    if (error instanceof UpstreamHttpError) {
        return error.retryable;
    }

    const nodes: ErrorLike[] = [];
    let current = asErrorLike(error);
    for (let depth = 0; depth < 3 && current; depth++) {
        nodes.push(current);
        current = asErrorLike(current.cause);
    }

    for (const node of nodes) {
        if (isRetryableNode(node)) {
            return true;
        }
    }

    for (const node of nodes) {
        if (node.message === "fetch failed") {
            // Unknown underlying failure — treat as transient.
            if (!node.cause) {
                return true;
            }
            // Wrapper with a cause that was not retryable above — not a network blip.
            return false;
        }
    }

    return false;
}

function formatNetworkErrorForLog(error: unknown): string {
    const err = asErrorLike(error);
    if (!err) {
        return String(error);
    }

    const summary = err.message || (err.code !== undefined ? String(err.code) : "unknown network error");
    const cause = asErrorLike(err.cause);
    if (!cause) {
        return summary;
    }

    const causeSummary = cause.code !== undefined
        ? String(cause.code)
        : cause.message || "unknown cause";
    return `${summary} (cause: ${causeSummary})`;
}

/**
 * How long to wait before the next attempt.
 *
 * Socket-level blips keep their flat second — they are usually gone by then.
 * A rate limit is the opposite: everything that lost the same capacity race is
 * waiting alongside us, so the wait grows and carries jitter, without which
 * they would all retry in lockstep and lose it again together.
 */
function retryDelayMs(error: unknown, attempt: number): number {
    if (!(error instanceof UpstreamHttpError)) return RETRY_DELAY_MS;
    const backoff = Math.min(HTTP_RETRY_MAX_MS, HTTP_RETRY_BASE_MS * 2 ** attempt);
    const jittered = backoff / 2 + Math.random() * (backoff / 2);
    // A `Retry-After` longer than our own cap is honoured only up to the cap:
    // waiting minutes on a turn the meeting has already moved past is worse
    // than one more attempt that may be refused.
    return Math.min(HTTP_RETRY_MAX_MS, Math.max(jittered, error.retryAfterMs ?? 0));
}

/**
 * Wrapper for network calls to handle specific low-level network errors
 * that might not be automatically retried by SDKs or fetch (e.g. 'terminated', 'ECONNRESET').
 */
export const withNetworkRetry = async <T>(
    fn: () => Promise<T>,
    context: string = "NetworkUtils",
    retries = DEFAULT_RETRIES,
    attempt = 0,
): Promise<T> => {
    try {
        return await fn();
    } catch (error: unknown) {
        if (retries > 0 && isRetryableNetworkError(error)) {
            const delay = retryDelayMs(error, attempt);
            Logger.warn(
                context,
                `Retrying operation due to network error: ${formatNetworkErrorForLog(error)} (attempt ${attempt + 1}, retrying in ${Math.round(delay)}ms)`,
            );
            await new Promise(res => setTimeout(res, delay));
            return withNetworkRetry(fn, context, retries - 1, attempt + 1);
        }
        throw error;
    }
};
