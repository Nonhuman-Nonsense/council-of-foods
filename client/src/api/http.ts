import type { ClientErrorKey } from "@shared/SocketTypes";
import { OWN_CLIENT_HEADER, OWN_CLIENT_VALUE } from "@shared/ownClient";
import { log, summarizeLogPayload } from "@/logger";
import {
  getDevLogEnabled,
  isDevLogCategoryEnabled,
} from "@/settings/councilSettings";

/** Typed error for a failed council API call, so callers can branch on status code. */
export class HttpStatusError extends Error {
  readonly status: number;
  /** The server's name for the failure, when it sent one. */
  readonly errorKey?: ClientErrorKey;
  constructor(status: number, message: string, errorKey?: ClientErrorKey) {
    super(message);
    this.name = "HttpStatusError";
    this.status = status;
    this.errorKey = errorKey;
  }
}

function shouldLogApi(): boolean {
  return getDevLogEnabled() && isDevLogCategoryEnabled("API");
}

function requestPath(input: RequestInfo | URL): string {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? `${input.pathname}${input.search}`
        : input.url;
  try {
    const url = new URL(
      raw,
      typeof window !== "undefined" ? window.location.origin : "http://localhost",
    );
    return `${url.pathname}${url.search}`;
  } catch {
    return String(raw);
  }
}

function summarizeRequestBody(body: BodyInit | null | undefined): unknown {
  if (body == null) return undefined;
  if (typeof body === "string") {
    try {
      return summarizeLogPayload(JSON.parse(body));
    } catch {
      return summarizeLogPayload(body);
    }
  }
  return `[${typeof body} body]`;
}

async function summarizeResponseBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  if (!text) return null;
  if (
    contentType.includes("json") ||
    text.startsWith("{") ||
    text.startsWith("[")
  ) {
    try {
      return summarizeLogPayload(JSON.parse(text));
    } catch {
      return summarizeLogPayload(text);
    }
  }
  return summarizeLogPayload(text);
}

/**
 * Waits before each retry of a request that got no response. Short enough that a visitor opening
 * a link barely notices, long enough to ride out a Wi-Fi hiccup or a laptop waking up.
 */
export const NETWORK_RETRY_DELAYS_MS = [500, 1_500, 4_000] as const;

/** Methods the server treats as safe to repeat; anything else could act twice. */
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD"]);

/**
 * True when a request got no response at all — offline, DNS, a dropped connection, a blocked
 * request — as opposed to an HTTP error status. `fetch` rejects with a `TypeError` for exactly
 * these; an abort is a `DOMException` and is not one.
 */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError;
}

function waitBeforeRetry(ms: number, signal: AbortSignal | null | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * `headers` with the own-client marker added, in whatever form they came — so the
 * server can tell a request it rejects from our client (a bug) from one a scanner
 * sent (see {@link OWN_CLIENT_HEADER}).
 */
export function withOwnClientMarker(headers?: HeadersInit): HeadersInit {
  if (headers instanceof Headers) {
    const marked = new Headers(headers);
    marked.set(OWN_CLIENT_HEADER, OWN_CLIENT_VALUE);
    return marked;
  }
  if (Array.isArray(headers)) return [...headers, [OWN_CLIENT_HEADER, OWN_CLIENT_VALUE]];
  return { ...headers, [OWN_CLIENT_HEADER]: OWN_CLIENT_VALUE };
}

export type CouncilFetchOptions = {
  /**
   * Retry when no response came back. Defaults to on for GET/HEAD and off otherwise: a POST that
   * did reach the server before the connection dropped would run twice.
   */
  retryOnNetworkError?: boolean;
};

/**
 * App HTTP entry point. All council API modules use this instead of raw `fetch`.
 *
 * A request that got no response is retried (see {@link NETWORK_RETRY_DELAYS_MS}); an HTTP
 * error status never is — the server answered, and asking again would get the same answer.
 * After the last attempt the original network error is rethrown; callers can recognise it
 * with {@link isNetworkError}.
 */
export async function councilFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: CouncilFetchOptions,
): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const path = requestPath(input);
  const requestBody = summarizeRequestBody(init?.body ?? undefined);
  const retries: readonly number[] =
    (options?.retryOnNetworkError ?? IDEMPOTENT_METHODS.has(method)) ? NETWORK_RETRY_DELAYS_MS : [];

  for (let attempt = 0; ; attempt++) {
    log.event(
      "API",
      `OUT ${method} ${path}`,
      requestBody === undefined ? undefined : { body: requestBody },
    );

    try {
      const res = await fetch(input, { ...init, headers: withOwnClientMarker(init?.headers) });
      const body = await summarizeResponseBody(res.clone());
      log.event("API", `IN ${method} ${path} ${res.status}`, {
        ok: res.ok,
        body,
      });
      if (!res.ok && !shouldLogApi()) {
        console.warn(`[Council] HTTP ${method} ${path} ${res.status}`, body);
      }
      return res;
    } catch (err) {
      const delayMs = retries[attempt];
      if (!isNetworkError(err) || delayMs === undefined || init?.signal?.aborted) {
        log.event("ERROR", `API ${method} ${path} network error`, err);
        throw err;
      }
      log.event("API", `RETRY ${method} ${path} in ${delayMs}ms`, {
        attempt: attempt + 1,
        error: err instanceof Error ? err.message : String(err),
      });
      await waitBeforeRetry(delayMs, init?.signal);
    }
  }
}
