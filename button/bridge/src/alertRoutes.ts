import type http from "node:http";
import { AlertsUnavailableError, type AlertMonitor } from "./alertMonitor.js";
import { isAllowedOrigin } from "./cors.js";
import { ServerError } from "./serverClient.js";
import { readJsonBody } from "./testApi.js";

export const INSTALLATION_KEY_PATH = "/v1/installation/key";
export const INSTALLATION_VENUES_PATH = "/v1/installation/venues";
export const INSTALLATION_VENUE_PATH = "/v1/installation/venue";
export const ALERT_TEST_PATH = "/v1/alerts/test";
export const LETTER_REPLIES_PATH = "/v1/installation/letter-replies";
export const LETTER_REPLY_PRINTED_PATH = "/v1/installation/letter-replies/printed";
export const ALERT_PATHS = [
  INSTALLATION_KEY_PATH,
  INSTALLATION_VENUES_PATH,
  INSTALLATION_VENUE_PATH,
  ALERT_TEST_PATH,
  LETTER_REPLIES_PATH,
  LETTER_REPLY_PRINTED_PATH,
];

/** A reply's id, as the council server makes it. */
export const REPLY_ID_PATTERN = /^[a-f0-9]{24}$/;

function sendJson(res: http.ServerResponse, status: number, body: unknown, cors: Record<string, string>): void {
  res.writeHead(status, { "Content-Type": "application/json", ...cors });
  res.end(JSON.stringify(body));
}

/**
 * Staff page ↔ bridge, setting up the installation:
 * - `PUT  /v1/installation/key {key|null}` → the installation key for the page's own server
 *   (its origin), saved once that server accepts it; null forgets it. Never read back.
 * - `GET  /v1/installation/venues` → `{ venues, current }` (from the council server; addresses masked)
 * - `PUT  /v1/installation/venue {venueId|null}` → choose where alerts go; only listed venues
 * - `POST /v1/alerts/test` → send a test alert to the chosen venue
 * - `GET  /v1/installation/letter-replies` → replies to the venue's letters, still to print
 * - `POST /v1/installation/letter-replies/printed {id}` → one is printed
 *
 * None of these can set an address: recipients only come from the server.
 */
export async function handleAlerts(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  alerts: AlertMonitor | null,
  baseCors: Record<string, string>,
): Promise<void> {
  const cors = { ...baseCors, "Access-Control-Allow-Methods": "GET, PUT, POST, OPTIONS" };
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
  if (origin !== undefined && !isAllowedOrigin(origin)) {
    sendJson(res, 403, { ok: false, error: "origin not allowed" }, {});
    return;
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }
  if (!alerts) {
    sendJson(res, 503, { ok: false, error: "printing is disabled on this bridge" }, cors);
    return;
  }

  try {
    if (pathname === INSTALLATION_KEY_PATH && req.method === "PUT") {
      // The key belongs to the server that served the page, so only a page can set it.
      if (origin === undefined) {
        sendJson(res, 400, { ok: false, error: "set the installation key from #staff" }, cors);
        return;
      }
      const body = (await readJsonBody(req).catch(() => ({}))) as { key?: unknown };
      const key = typeof body.key === "string" ? body.key.trim() : body.key;
      if (key !== null && (typeof key !== "string" || key === "")) {
        sendJson(res, 400, { ok: false, error: "expected { key: string | null }" }, cors);
        return;
      }
      await alerts.setInstallationKey(origin, key);
      sendJson(res, 200, { ok: true }, cors);
    } else if (pathname === INSTALLATION_VENUES_PATH && req.method === "GET") {
      sendJson(res, 200, { ok: true, ...(await alerts.listVenues(origin)) }, cors);
    } else if (pathname === INSTALLATION_VENUE_PATH && req.method === "PUT") {
      const body = (await readJsonBody(req).catch(() => ({}))) as { venueId?: unknown };
      if (body.venueId !== null && typeof body.venueId !== "string") {
        sendJson(res, 400, { ok: false, error: "expected { venueId: string | null }" }, cors);
        return;
      }
      const venue = await alerts.setVenue(body.venueId, origin);
      sendJson(res, 200, { ok: true, venue }, cors);
    } else if (pathname === ALERT_TEST_PATH && req.method === "POST") {
      await alerts.sendTest(origin);
      sendJson(res, 200, { ok: true }, cors);
    } else if (pathname === LETTER_REPLIES_PATH && req.method === "GET") {
      sendJson(res, 200, { ok: true, replies: await alerts.letterReplies(origin) }, cors);
    } else if (pathname === LETTER_REPLY_PRINTED_PATH && req.method === "POST") {
      const body = (await readJsonBody(req).catch(() => ({}))) as { id?: unknown };
      if (typeof body.id !== "string" || !REPLY_ID_PATTERN.test(body.id)) {
        sendJson(res, 400, { ok: false, error: "expected { id }" }, cors);
        return;
      }
      await alerts.markLetterReplyPrinted(body.id, origin);
      sendJson(res, 200, { ok: true }, cors);
    } else {
      sendJson(res, 405, { ok: false, error: "method not allowed" }, cors);
    }
  } catch (error) {
    if (error instanceof AlertsUnavailableError) {
      sendJson(res, 409, { ok: false, error: error.message }, cors);
    } else if (error instanceof ServerError) {
      sendJson(res, 502, { ok: false, error: error.message }, cors);
    } else {
      console.error("[button-bridge/alerts] request failed", error);
      sendJson(res, 500, { ok: false, error: "alerts request failed" }, cors);
    }
  }
}
