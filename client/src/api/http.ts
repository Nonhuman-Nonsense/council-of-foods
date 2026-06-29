import { log, summarizeLogPayload } from "@/logger";
import {
  getDevLogEnabled,
  isDevLogCategoryEnabled,
} from "@/settings/councilSettings";

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
 * App HTTP entry point. All council API modules use this instead of raw `fetch`.
 */
export async function councilFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const path = requestPath(input);
  const requestBody = summarizeRequestBody(init?.body ?? undefined);

  log.event(
    "API",
    `OUT ${method} ${path}`,
    requestBody === undefined ? undefined : { body: requestBody },
  );

  try {
    const res = await fetch(input, init);
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
    log.event("ERROR", `API ${method} ${path} network error`, err);
    throw err;
  }
}
