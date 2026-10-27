/**
 * What an installation bridge measures about its network once a minute and sends to
 * `POST /api/installation/network`. Read back with `npm run network` in server/.
 *
 * Checking the router as well as the internet is what tells a local problem (cable, switch,
 * router) from the venue's internet connection.
 */

/** A burst of pings: how many came back, and how long they took. */
export interface PingStats {
  sent: number;
  received: number;
  /** Null when nothing came back. */
  avgMs: number | null;
  maxMs: number | null;
  /** Standard deviation of the round trips: how unevenly packets arrive. */
  jitterMs: number | null;
}

export interface NetworkSample {
  /** When it was taken, ISO 8601, by the Mac's clock. */
  t: string;
  /** Interface carrying the default route (`en0`); null when there is no route at all. */
  iface: string | null;
  /** Negotiated link, as macOS reports it (`autoselect (1000baseT <full-duplex>)`). */
  link: string | null;
  /** Pings to the router; null when there is no router to ping. */
  gateway: PingStats | null;
  /** Pings to a well-known address on the internet. */
  internet: PingStats;
  /** One request to the council server, in ms; null when it got no answer. */
  serverMs: number | null;
  /** Interface errors since the previous sample; null when unknown (first sample, counter reset). */
  inErrors: number | null;
  outErrors: number | null;
}

export interface NetworkSampleBatch {
  venueId: string;
  /** The installation Mac's host name. */
  host?: string;
  samples: NetworkSample[];
}

export const NETWORK_SAMPLE_LIMITS = {
  /** Samples in one request, so a day's backlog goes up in a few requests of ~50 kB. */
  maxSamples: 200,
  /** Backlog kept on the bridge while the server can't be reached: a day. */
  maxPending: 24 * 60,
  maxTextChars: 100,
} as const;

/** An internet outage: every sample in it reached neither the internet nor the server. */
export function isOffline(sample: NetworkSample): boolean {
  return sample.internet.received === 0 && sample.serverMs === null;
}
