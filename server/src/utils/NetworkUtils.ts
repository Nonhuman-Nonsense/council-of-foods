import { Logger } from "@utils/Logger.js";

const DEFAULT_RETRIES = 3;

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
 * Wrapper for network calls to handle specific low-level network errors
 * that might not be automatically retried by SDKs or fetch (e.g. 'terminated', 'ECONNRESET').
 */
export const withNetworkRetry = async <T>(fn: () => Promise<T>, context: string = "NetworkUtils", retries = DEFAULT_RETRIES): Promise<T> => {
    try {
        return await fn();
    } catch (error: unknown) {
        if (retries > 0 && isRetryableNetworkError(error)) {
            Logger.warn(
                context,
                `Retrying operation due to network error: ${formatNetworkErrorForLog(error)} (attempt ${4 - retries}/3)`,
            );
            await new Promise(res => setTimeout(res, 1000));
            return withNetworkRetry(fn, context, retries - 1);
        }
        throw error;
    }
};
