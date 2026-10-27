import { chmod, readFile, rename, rm, writeFile } from "node:fs/promises";
import { isOpen } from "./openingHours.js";
import {
  INITIAL_ALERT_STATE,
  stepAlerts,
  type AlertState,
  type AlertTimings,
  type Outgoing,
} from "./printAlerts.js";
import type { PrintHealth } from "./printSpool.js";
import { ServerClient, ServerError, type LetterReplyToPrint, type Venue } from "./serverClient.js";

export type AlertMonitorOptions = {
  spool: { health(): PrintHealth };
  /** JSON file holding the chosen venue and the alert state, so restarts don't re-send. */
  stateFile: string;
  /** JSON file holding the council server and the installation key; readable by its owner only. */
  installationFile: string;
  host: string;
  timings: AlertTimings;
  tickMs: number;
  venueRefreshMs: number;
  deliveryRetryBaseMs: number;
  deliveryRetryMaxMs: number;
  testAlertIntervalMs: number;
};

type Saved = {
  venue: Venue | null;
  alert: AlertState;
  wasOpen: boolean;
  /** The newest alert not yet accepted by the server. */
  outbox: Outgoing | null;
  /** Whether staff were told about the current problem; if not, its recovery isn't news. */
  problemDelivered: boolean;
};

/** The council server this installation belongs to, and its key, as staff entered it on #staff. */
type Installation = { serverUrl: string; key: string };

export type AlertsHealth = {
  /** The council server the installation key was saved for; null until staff enter one. Never the key. */
  server: string | null;
  venue: { id: string; name: string; recipients: string[] } | null;
  open: boolean | null;
  phase: AlertState["phase"];
  lastSentAt: string | null;
  lastError: string | null;
  undelivered: boolean;
};

export class AlertsUnavailableError extends Error {}

/**
 * Watches the spool's `attention`, decides when museum staff should be emailed
 * (see printAlerts.ts), and asks the council server to email the chosen venue.
 * Delivery failures are retried with backoff; only the newest alert is kept.
 */
export class AlertMonitor {
  private saved: Saved = {
    venue: null,
    alert: INITIAL_ALERT_STATE,
    wasOpen: false,
    outbox: null,
    problemDelivered: false,
  };
  private server: ServerClient | null = null;
  private tickTimer: NodeJS.Timeout | null = null;
  private venueTimer: NodeJS.Timeout | null = null;
  private ticking: Promise<void> | null = null;
  private failures = 0;
  private nextDeliveryAt = 0;
  private lastSentAt: number | null = null;
  private lastError: string | null = null;
  private lastTestAt = 0;

  constructor(private readonly options: AlertMonitorOptions) {}

  async start(): Promise<void> {
    try {
      const raw = JSON.parse(await readFile(this.options.stateFile, "utf8")) as Partial<Saved>;
      this.saved = { ...this.saved, ...raw };
    } catch {
      // First start, or an unreadable file: begin from ok.
    }
    try {
      const installation = JSON.parse(await readFile(this.options.installationFile, "utf8")) as Installation;
      this.server = new ServerClient(installation.serverUrl, installation.key);
    } catch {
      // No key entered yet.
    }
    if (!this.server) {
      console.log("[button-bridge/alerts] no installation key yet (enter it on #staff) — printer alerts off");
    } else {
      console.log(
        `[button-bridge/alerts] alerts via ${this.server.getBaseUrl()}, venue: ${this.saved.venue?.name ?? "none chosen"}`,
      );
    }
    this.tickTimer = setInterval(() => void this.tick(), this.options.tickMs);
    this.venueTimer = setInterval(() => void this.refreshVenue(), this.options.venueRefreshMs);
    void this.refreshVenue();
  }

  async stop(): Promise<void> {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.venueTimer) clearInterval(this.venueTimer);
    this.tickTimer = null;
    this.venueTimer = null;
    await this.ticking;
  }

  health(now = Date.now()): AlertsHealth {
    const { venue } = this.saved;
    return {
      server: this.server?.getBaseUrl() ?? null,
      venue: venue ? { id: venue.id, name: venue.name, recipients: venue.recipients } : null,
      open: venue ? isOpen(venue.openingHours, venue.timezone, now) : null,
      phase: this.saved.alert.phase,
      lastSentAt: this.lastSentAt === null ? null : new Date(this.lastSentAt).toISOString(),
      lastError: this.lastError,
      undelivered: this.saved.outbox !== null,
    };
  }

  /**
   * Saves the installation key for the council server at `serverUrl` (the staff page's own
   * origin), once that server accepts it; null forgets the key. A different server's venues
   * mean nothing here, so moving to another server clears the venue.
   */
  async setInstallationKey(serverUrl: string, key: string | null): Promise<void> {
    if (key === null) {
      this.server = null;
      await rm(this.options.installationFile, { force: true });
      console.log("[button-bridge/alerts] installation key removed — printer alerts off");
      return;
    }
    const server = new ServerClient(serverUrl, key);
    try {
      await server.getVenues();
    } catch (error) {
      if (error instanceof ServerError && error.status === 401) {
        throw new AlertsUnavailableError(`${server.getBaseUrl()} did not accept this installation key`);
      }
      throw error;
    }
    const installation: Installation = { serverUrl: server.getBaseUrl(), key };
    const tmp = `${this.options.installationFile}.tmp`;
    await writeFile(tmp, JSON.stringify(installation, null, 2), { mode: 0o600 });
    await chmod(tmp, 0o600);
    await rename(tmp, this.options.installationFile);

    if (this.server?.getBaseUrl() !== server.getBaseUrl() && this.saved.venue) {
      this.saved = { ...this.saved, venue: null, outbox: null };
      await this.persist();
    }
    this.server = server;
    this.lastError = null;
    console.log(`[button-bridge/alerts] installation key saved for ${server.getBaseUrl()}`);
  }

  /** The council server and chosen venue, once staff have set both on #staff. */
  target(): { server: ServerClient; venueId: string } | null {
    const venue = this.saved.venue;
    return this.server && venue ? { server: this.server, venueId: venue.id } : null;
  }

  async listVenues(origin?: string): Promise<{ venues: Venue[]; current: string | null }> {
    const venues = await this.requireServer(origin).getVenues();
    return { venues, current: this.saved.venue?.id ?? null };
  }

  async setVenue(venueId: string | null, origin?: string): Promise<Venue | null> {
    if (venueId === null) {
      this.saved = { ...this.saved, venue: null, outbox: null };
    } else {
      const venue = (await this.requireServer(origin).getVenues()).find((v) => v.id === venueId);
      if (!venue) throw new AlertsUnavailableError(`unknown venue: ${venueId}`);
      this.saved = { ...this.saved, venue };
    }
    console.log(`[button-bridge/alerts] venue set to ${this.saved.venue?.name ?? "none"}`);
    await this.persist();
    return this.saved.venue;
  }

  /**
   * Replies to the chosen venue's letters that are not yet printed. The page renders and prints
   * them (only a page can draw a PDF), then says so with {@link markLetterReplyPrinted}.
   */
  async letterReplies(origin?: string): Promise<LetterReplyToPrint[]> {
    const server = this.requireServer(origin);
    const venue = this.saved.venue;
    return venue ? server.getLetterReplies(venue.id) : [];
  }

  async markLetterReplyPrinted(id: string, origin?: string): Promise<void> {
    await this.requireServer(origin).markLetterReplyPrinted(id);
  }

  /** Sends a test alert straight away. Rate-limited, since any allowed page can ask. */
  async sendTest(origin?: string, now = Date.now()): Promise<void> {
    const server = this.requireServer(origin);
    const venue = this.saved.venue;
    if (!venue) throw new AlertsUnavailableError("choose a venue first");
    if (now - this.lastTestAt < this.options.testAlertIntervalMs) {
      throw new AlertsUnavailableError("a test alert was just sent; try again in a minute");
    }
    this.lastTestAt = now;
    await server.sendPrinterAlert({ ...this.context(), venueId: venue.id, kind: "test" });
    this.lastSentAt = now;
  }

  /** Test hook: one evaluation and delivery attempt, now. */
  async tick(now = Date.now()): Promise<void> {
    if (this.ticking) return this.ticking;
    this.ticking = this.evaluate(now).finally(() => {
      this.ticking = null;
    });
    return this.ticking;
  }

  private async evaluate(now: number): Promise<void> {
    const { venue } = this.saved;
    const attention = this.options.spool.health().attention;
    const open = venue ? isOpen(venue.openingHours, venue.timezone, now) : false;

    const before = JSON.stringify(this.saved);
    const { state, send } = stepAlerts(
      this.saved.alert,
      attention ? { reason: attention.reason, since: Date.parse(attention.since) } : null,
      { now, open, wasOpen: this.saved.wasOpen, timings: this.options.timings },
    );
    this.saved = { ...this.saved, alert: state, wasOpen: open };

    if (send) {
      console.log(`[button-bridge/alerts] ${send.kind}: ${send.reason}`);
      if (send.kind === "resolved" && !this.saved.problemDelivered) {
        // Staff never heard about it, so there is nothing to un-announce.
        this.saved = { ...this.saved, outbox: null };
      } else {
        this.saved = {
          ...this.saved,
          outbox: send,
          problemDelivered: send.kind === "problem" ? false : this.saved.problemDelivered,
        };
        this.failures = 0;
        this.nextDeliveryAt = 0;
      }
    }

    if (JSON.stringify(this.saved) !== before) await this.persist();
    await this.deliver(now);
  }

  private async deliver(now: number): Promise<void> {
    const { outbox, venue } = this.saved;
    if (!outbox || now < this.nextDeliveryAt) return;
    if (!this.server || !venue) {
      // Nobody to tell. Don't hoard it for a venue chosen later.
      this.saved = { ...this.saved, outbox: null };
      await this.persist();
      return;
    }

    try {
      await this.server.sendPrinterAlert({
        ...this.context(),
        venueId: venue.id,
        kind: outbox.kind,
        reason: outbox.reason,
        since: new Date(outbox.since).toISOString(),
      });
    } catch (error) {
      this.failures += 1;
      this.lastError = error instanceof Error ? error.message : String(error);
      const delay = Math.min(
        this.options.deliveryRetryBaseMs * 2 ** (this.failures - 1),
        this.options.deliveryRetryMaxMs,
      );
      this.nextDeliveryAt = now + delay;
      console.warn(`[button-bridge/alerts] could not deliver ${outbox.kind}, retrying in ${delay}ms:`, this.lastError);
      return;
    }

    this.failures = 0;
    this.lastError = null;
    this.lastSentAt = now;
    this.saved = {
      ...this.saved,
      outbox: this.saved.outbox === outbox ? null : this.saved.outbox,
      problemDelivered: outbox.kind === "resolved" ? false : true,
    };
    console.log(`[button-bridge/alerts] delivered ${outbox.kind} to ${venue.name}`);
    await this.persist();
  }

  private context(): { printer: string | null; waiting: number; host: string } {
    const print = this.options.spool.health();
    return {
      printer: print.printer?.name ?? null,
      waiting: print.pending + (print.printer?.queuedJobs ?? 0),
      host: this.options.host,
    };
  }

  private async refreshVenue(): Promise<void> {
    const { server } = this;
    const current = this.saved.venue;
    if (!server || !current) return;
    try {
      const latest = (await server.getVenues()).find((venue) => venue.id === current.id);
      if (!latest) {
        this.lastError = `venue ${current.id} is no longer listed on the council server`;
        return;
      }
      if (JSON.stringify(latest) !== JSON.stringify(current)) {
        this.saved = { ...this.saved, venue: latest };
        await this.persist();
      }
    } catch (error) {
      // Keep the saved venue; opening hours still work offline.
      if (!(error instanceof ServerError)) throw error;
    }
  }

  /**
   * The council server, for a request from the staff page at `origin`. A page from another
   * server (council-of-foods.com asking a bridge keyed for council-of-forest.com) is refused,
   * so it can never choose venues that server doesn't have. Requests without an origin come
   * from this Mac itself.
   */
  private requireServer(origin?: string): ServerClient {
    if (!this.server) {
      throw new AlertsUnavailableError("no installation key on this bridge; enter it on #staff");
    }
    if (origin !== undefined && origin !== this.server.getBaseUrl()) {
      throw new AlertsUnavailableError(`this bridge's installation key is for ${this.server.getBaseUrl()}`);
    }
    return this.server;
  }

  private async persist(): Promise<void> {
    const tmp = `${this.options.stateFile}.tmp`;
    try {
      await writeFile(tmp, JSON.stringify(this.saved, null, 2));
      await rename(tmp, this.options.stateFile);
    } catch (error) {
      console.error("[button-bridge/alerts] could not save alert state", error);
    }
  }
}
