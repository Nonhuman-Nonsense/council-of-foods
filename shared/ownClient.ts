/**
 * The header the council's own client puts on every request to its server.
 *
 * A request the server rejects (4xx) is worth an ErrorBot report only when our
 * own client sent it: then the client and server disagree, which is a bug or a
 * stale bundle. Without the header it came from something else — a scanner
 * trying URLs it found in the bundle, a crawler, a link typed by hand — and the
 * rejection is the right answer, nothing to report.
 */
export const OWN_CLIENT_HEADER = "X-Council-Client";
export const OWN_CLIENT_VALUE = "app";

/** Whether request headers carry the own-client marker. Header names are case-insensitive. */
export function hasOwnClientMarker(headers: Record<string, string | string[] | undefined>): boolean {
  const value = headers[OWN_CLIENT_HEADER.toLowerCase()];
  return (Array.isArray(value) ? value[0] : value) === OWN_CLIENT_VALUE;
}
