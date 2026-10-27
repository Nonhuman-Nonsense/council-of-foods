import { execFile } from "node:child_process";
import {
  NETWORK_SAMPLE_LIMITS,
  type NetworkSample,
  type PingStats,
} from "../../../shared/networkSamples.js";
import { ServerError, type ServerClient } from "./serverClient.js";

/** Where samples go: the council server and venue chosen for alerts on #staff. */
export type NetworkTarget = { server: ServerClient; venueId: string };

/** Runs a command and gives back its output, also when it exits non-zero (ping does on loss). */
export type CommandRunner = (command: string, args: string[]) => Promise<string>;

export type NetworkMonitorOptions = {
  target: () => NetworkTarget | null;
  host: string;
  sampleMs: number;
  /** Pinged to tell "the internet" from "the council server". */
  internetHost: string;
  run?: CommandRunner;
};

const PINGS = 5;
const COMMAND_TIMEOUT_MS = 10_000;

export const runCommand: CommandRunner = (command, args) =>
  new Promise((resolve) => {
    execFile(command, args, { timeout: COMMAND_TIMEOUT_MS }, (_error, stdout) => resolve(String(stdout ?? "")));
  });

/** `route -n get default` → the router and the interface it is reached through. */
export function parseDefaultRoute(text: string): { gateway: string | null; iface: string | null } {
  return {
    gateway: /^\s*gateway:\s*(\S+)/m.exec(text)?.[1] ?? null,
    iface: /^\s*interface:\s*(\S+)/m.exec(text)?.[1] ?? null,
  };
}

/** The summary of `ping -q`, macOS or Linux. */
export function parsePing(text: string, sent: number): PingStats {
  const counts = /(\d+) packets transmitted, (\d+) (?:packets )?received/.exec(text);
  const times = /= ([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+) ms/.exec(text);
  const received = counts ? Number(counts[2]) : 0;
  return {
    sent: counts ? Number(counts[1]) : sent,
    received,
    avgMs: times && received > 0 ? round(Number(times[2])) : null,
    maxMs: times && received > 0 ? round(Number(times[3])) : null,
    jitterMs: times && received > 0 ? round(Number(times[4])) : null,
  };
}

/** `netstat -I <iface>` → its cumulative error counters (the link-level row). */
export function parseInterfaceErrors(text: string): { inErrors: number; outErrors: number } | null {
  const row = text.split("\n").find((line) => line.includes("<Link#"));
  if (!row) return null;
  // Name Mtu Network Address Ipkts Ierrs Opkts Oerrs Coll — the address can be missing.
  const numbers = row.trim().split(/\s+/).slice(3).filter((field) => /^\d+$/.test(field)).map(Number);
  if (numbers.length < 5) return null;
  const [, inErrors, , outErrors] = numbers.slice(-5);
  return { inErrors, outErrors };
}

/** `ifconfig <iface>` → the negotiated link, or "inactive" when the cable is out. */
export function parseLink(text: string): string | null {
  if (/^\s*status:\s*inactive/m.test(text)) return "inactive";
  return /^\s*media:\s*(.+)$/m.exec(text)?.[1]?.trim().slice(0, NETWORK_SAMPLE_LIMITS.maxTextChars) ?? null;
}

function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}

/**
 * Once a minute (macOS commands): pings the router and the internet, times one request to the council server,
 * and reads the interface's error counters. Samples go to the council server, so a venue's
 * network can be read back afterwards and outages reach the team. While the server can't be
 * reached they wait here (a day at most) and go up together once it answers.
 */
export class NetworkMonitor {
  private readonly run: CommandRunner;
  private pending: NetworkSample[] = [];
  private lastCounters: { iface: string; inErrors: number; outErrors: number } | null = null;
  private timer: NodeJS.Timeout | null = null;
  private ticking: Promise<void> | null = null;

  constructor(private readonly options: NetworkMonitorOptions) {
    this.run = options.run ?? runCommand;
  }

  start(): void {
    this.timer = setInterval(() => void this.tick(), this.options.sampleMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.ticking;
  }

  pendingCount(): number {
    return this.pending.length;
  }

  /** Test hook: one sample and delivery attempt, now. */
  async tick(): Promise<void> {
    if (this.ticking) return this.ticking;
    this.ticking = this.sampleAndSend().finally(() => {
      this.ticking = null;
    });
    return this.ticking;
  }

  private async sampleAndSend(): Promise<void> {
    const target = this.options.target();
    if (!target) {
      // Nobody to tell. Don't hoard samples for a venue chosen later.
      this.pending = [];
      return;
    }
    this.pending.push(await this.sample(target.server));
    if (this.pending.length > NETWORK_SAMPLE_LIMITS.maxPending) {
      this.pending.splice(0, this.pending.length - NETWORK_SAMPLE_LIMITS.maxPending);
    }
    await this.deliver(target);
  }

  private async sample(server: ServerClient): Promise<NetworkSample> {
    const t = new Date().toISOString();
    const { gateway, iface } = parseDefaultRoute(await this.run("route", ["-n", "get", "default"]));
    const [gatewayPing, internetPing, serverMs, counters, link] = await Promise.all([
      gateway ? this.ping(gateway) : Promise.resolve(null),
      this.ping(this.options.internetHost),
      this.timeServer(server),
      iface ? this.run("netstat", ["-I", iface]).then(parseInterfaceErrors) : Promise.resolve(null),
      iface ? this.run("ifconfig", [iface]).then(parseLink) : Promise.resolve(null),
    ]);
    return { t, iface, link, gateway: gatewayPing, internet: internetPing, serverMs, ...this.errorsSinceLast(iface, counters) };
  }

  private async ping(host: string): Promise<PingStats> {
    return parsePing(await this.run("ping", ["-n", "-q", "-c", String(PINGS), "-i", "0.2", "-t", "3", host]), PINGS);
  }

  private async timeServer(server: ServerClient): Promise<number | null> {
    const started = performance.now();
    try {
      await server.getVenues();
    } catch {
      return null;
    }
    return Math.round(performance.now() - started);
  }

  private errorsSinceLast(
    iface: string | null,
    counters: { inErrors: number; outErrors: number } | null,
  ): { inErrors: number | null; outErrors: number | null } {
    const last = this.lastCounters;
    this.lastCounters = iface && counters ? { iface, ...counters } : null;
    // A different interface, or counters that went down (the Mac restarted the interface), start over.
    if (!iface || !counters || !last || last.iface !== iface
      || counters.inErrors < last.inErrors || counters.outErrors < last.outErrors) {
      return { inErrors: null, outErrors: null };
    }
    return { inErrors: counters.inErrors - last.inErrors, outErrors: counters.outErrors - last.outErrors };
  }

  private async deliver(target: NetworkTarget): Promise<void> {
    while (this.pending.length > 0) {
      const samples = this.pending.slice(0, NETWORK_SAMPLE_LIMITS.maxSamples);
      try {
        await target.server.sendNetworkSamples({ venueId: target.venueId, host: this.options.host, samples });
      } catch (error) {
        if (error instanceof ServerError && error.status !== null && error.status >= 400 && error.status < 500 && error.status !== 429) {
          // Refused, not lost: sending these again would block every sample after them.
          console.warn(`[button-bridge/network] server refused ${samples.length} samples, dropping them:`, error.message);
          this.pending.splice(0, samples.length);
          continue;
        }
        // Kept for the next minute. Said once per outage, not every minute.
        if (this.pending.length === 1) {
          console.warn("[button-bridge/network] could not send samples, keeping them:", error instanceof Error ? error.message : error);
        }
        return;
      }
      this.pending.splice(0, samples.length);
    }
  }
}
