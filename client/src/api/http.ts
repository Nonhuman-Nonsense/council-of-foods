import { log } from "@/logger";

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

/**
 * App HTTP entry point. All council API modules use this instead of raw `fetch`.
 */
export async function councilFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const path = requestPath(input);

  log.event("API", `OUT ${method} ${path}`);

  try {
    const res = await fetch(input, init);
    log.event("API", `IN ${method} ${path} ${res.status}`, { ok: res.ok });
    return res;
  } catch (err) {
    log.event("ERROR", `API ${method} ${path} network error`, err);
    throw err;
  }
}
