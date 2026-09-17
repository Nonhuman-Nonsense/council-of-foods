import { getBridgeHttpBase } from "./printClient";

/**
 * Staff page ↔ bridge, for printer alert emails. The venue is chosen on the
 * staff page (see `getVenueId`) and handed to the bridge, which only accepts
 * venues the council server lists — never an address.
 */

const REQUEST_TIMEOUT_MS = 20_000;

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getBridgeHttpBase()}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("Bridge not reachable");
  }
  const json = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(json.error ?? `Bridge answered ${response.status}`);
  return json;
}

export async function chooseAlertVenue(venueId: string | null): Promise<void> {
  await call("PUT", "/v1/alerts/venue", { venueId });
}

export async function sendTestAlert(): Promise<void> {
  await call("POST", "/v1/alerts/test");
}
