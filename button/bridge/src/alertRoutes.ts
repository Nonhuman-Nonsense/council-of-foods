import type http from "node:http";
import { AlertsUnavailableError, type AlertMonitor } from "./alertMonitor.js";
import { isAllowedOrigin } from "./cors.js";
import { ServerError } from "./serverClient.js";
import { readJsonBody } from "./testApi.js";

export const ALERT_VENUES_PATH = "/v1/alerts/venues";
export const ALERT_VENUE_PATH = "/v1/alerts/venue";
export const ALERT_TEST_PATH = "/v1/alerts/test";
export const ALERT_PATHS = [ALERT_VENUES_PATH, ALERT_VENUE_PATH, ALERT_TEST_PATH];

function sendJson(res: http.ServerResponse, status: number, body: unknown, cors: Record<string, string>): void {
  res.writeHead(status, { "Content-Type": "application/json", ...cors });
  res.end(JSON.stringify(body));
}

/**
 * Staff page ↔ bridge, for printer alerts:
 * - `GET  /v1/alerts/venues` → `{ venues, current }` (from the council server; addresses masked)
 * - `PUT  /v1/alerts/venue {venueId|null}` → choose where alerts go; only listed venues
 * - `POST /v1/alerts/test` → send a test alert to the chosen venue
 *
 * None of these can set an address or a key: recipients only come from the server.
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
    if (pathname === ALERT_VENUES_PATH && req.method === "GET") {
      sendJson(res, 200, { ok: true, ...(await alerts.listVenues()) }, cors);
    } else if (pathname === ALERT_VENUE_PATH && req.method === "PUT") {
      const body = (await readJsonBody(req).catch(() => ({}))) as { venueId?: unknown };
      if (body.venueId !== null && typeof body.venueId !== "string") {
        sendJson(res, 400, { ok: false, error: "expected { venueId: string | null }" }, cors);
        return;
      }
      const venue = await alerts.setVenue(body.venueId);
      sendJson(res, 200, { ok: true, venue }, cors);
    } else if (pathname === ALERT_TEST_PATH && req.method === "POST") {
      await alerts.sendTest();
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
