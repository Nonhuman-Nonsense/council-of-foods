/**
 * Reads back the network samples installation bridges send once a minute
 * (`POST /api/installation/network`): an hour-by-hour summary, and every outage. Reads the
 * database the server's .env names, like the other scripts here.
 *
 *   npm run network -- --venue havremagasinet               the last 24 hours, by the hour
 *   npm run network -- --venue havremagasinet --since 7d
 *   npm run network -- --venue havremagasinet --since 2h --minutes   every sample
 *
 * Also: --json (raw samples). --since takes 30m, 2h, 3d; it defaults to 24h.
 *
 * Reading it: loss or slow pings to the router point at the local network (cable, switch,
 * router); a router that answers while the internet doesn't points at the venue's connection.
 * Interface errors, or a link that drops below 1000baseT, point at the cable.
 */

import { bold, gray, red, yellow } from "colorette";
import type { Filter } from "mongodb";
import type { StoredNetworkSample } from "@models/DBModels.js";
import { closeDb, initDb, networkSamplesCollection } from "@services/DbService.js";
import { findOutages, OUTAGE_MIN_SAMPLES } from "@api/networkSamples.js";

function arg(name: string): string | undefined {
    const index = process.argv.indexOf(`--${name}`);
    return index !== -1 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--")
        ? process.argv[index + 1]
        : undefined;
}

function flag(name: string): boolean {
    return process.argv.includes(`--${name}`);
}

function parseSince(value: string): Date {
    const match = /^(\d+)([mhd])$/.exec(value);
    if (!match) throw new Error(`--since takes 30m, 2h or 3d, not "${value}"`);
    const unitMs = { m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as "m" | "h" | "d"];
    return new Date(Date.now() - Number(match[1]) * unitMs);
}

const pad = (n: number) => String(n).padStart(2, "0");

function clock(date: Date, withSeconds = false): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
        `${pad(date.getHours())}:${pad(date.getMinutes())}${withSeconds ? `:${pad(date.getSeconds())}` : ""}`;
}

function average(values: number[]): number | null {
    return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

function ms(value: number | null): string {
    return value === null ? "-" : String(Math.round(value));
}

/** Share of pings lost, coloured: any loss is worth a look, much loss is a problem. */
function loss(sent: number, received: number): string {
    if (sent === 0) return "-";
    const share = (sent - received) / sent;
    const text = `${(share * 100).toFixed(1)}%`;
    return share >= 0.1 ? red(text) : share > 0 ? yellow(text) : text;
}

/** Round-trip time, coloured where realtime audio starts to suffer. */
function latency(value: number | null, slowMs: number): string {
    const text = ms(value);
    return value === null ? text : value >= slowMs * 2 ? red(text) : value >= slowMs ? yellow(text) : text;
}

function shortLink(link: string | null): string {
    if (!link) return "-";
    return /\((\S+)/.exec(link)?.[1] ?? link;
}

type Columns = string[];

/** Colour codes, left out when padding columns. */
const ANSI_COLOR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function printTable(header: Columns, rows: Columns[]): void {
    const strip = (text: string) => text.replace(ANSI_COLOR, "");
    const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => strip(row[i]).length)));
    const line = (cells: Columns) => cells.map((cell, i) => cell + " ".repeat(widths[i] - strip(cell).length)).join("  ");
    console.log(bold(line(header)));
    for (const row of rows) console.log(line(row));
}

function summarise(samples: StoredNetworkSample[]): Columns {
    const sum = (pick: (s: StoredNetworkSample) => number) => samples.reduce((total, s) => total + pick(s), 0);
    const gateway = samples.filter((s) => s.gateway);
    const errors = sum((s) => (s.inErrors ?? 0) + (s.outErrors ?? 0));
    const links = [...new Set(samples.map((s) => shortLink(s.link)))];
    const serverTimes = samples.flatMap((s) => (s.serverMs === null ? [] : [s.serverMs]));
    return [
        String(samples.length),
        loss(sum((s) => s.internet.sent), sum((s) => s.internet.received)),
        latency(average(samples.flatMap((s) => (s.internet.avgMs === null ? [] : [s.internet.avgMs]))), 100),
        latency(Math.max(0, ...samples.map((s) => s.internet.maxMs ?? 0)) || null, 300),
        latency(average(samples.flatMap((s) => (s.internet.jitterMs === null ? [] : [s.internet.jitterMs]))), 30),
        `${latency(average(serverTimes), 500)}/${latency(serverTimes.length ? Math.max(...serverTimes) : null, 1500)}`,
        gateway.length ? loss(sum((s) => s.gateway?.sent ?? 0), sum((s) => s.gateway?.received ?? 0)) : red("no router"),
        latency(Math.max(0, ...gateway.map((s) => s.gateway?.maxMs ?? 0)) || null, 20),
        errors > 0 ? red(String(errors)) : "0",
        links.length > 1 ? yellow(links.join(" ")) : links[0] ?? "-",
    ];
}

const SUMMARY_HEADER = ["internet loss", "avg ms", "max ms", "jitter", "server avg/max", "router loss", "router max", "if errors", "link"];

async function main(): Promise<void> {
    const venue = arg("venue");
    const since = parseSince(arg("since") ?? "24h");

    await initDb(undefined, undefined, { readOnly: true });
    try {
        if (!networkSamplesCollection) throw new Error("network_samples collection unavailable");
        const filter: Filter<StoredNetworkSample> = { t: { $gte: since } };
        if (venue) filter.venueId = venue;
        const samples = await networkSamplesCollection.find(filter).sort({ venueId: 1, t: 1 }).toArray();

        if (flag("json")) {
            console.log(JSON.stringify(samples, null, 2));
            return;
        }
        if (samples.length === 0) {
            console.log(gray(`No samples${venue ? ` for ${venue}` : ""} since ${clock(since)}.`));
            return;
        }

        for (const venueId of [...new Set(samples.map((s) => s.venueId))]) {
            const own = samples.filter((s) => s.venueId === venueId);
            console.log(bold(`\n── ${venueId}${own[0].host ? ` · ${own[0].host}` : ""} · ${own.length} samples since ${clock(since)} ──\n`));

            if (flag("minutes")) {
                printTable(["time", ...SUMMARY_HEADER], own.map((s) => [clock(s.t, true), ...summarise([s]).slice(1)]));
            } else {
                const hours = new Map<string, StoredNetworkSample[]>();
                for (const s of own) {
                    const hour = `${clock(s.t).slice(0, 13)}:00`;
                    hours.set(hour, [...(hours.get(hour) ?? []), s]);
                }
                printTable(["hour", "samples", ...SUMMARY_HEADER], [...hours].map(([hour, group]) => [hour, ...summarise(group)]));
            }

            const outages = findOutages(own.map((s) => ({ ...s, t: s.t.toISOString() })));
            console.log(bold(`\n${outages.length} outage${outages.length === 1 ? "" : "s"} of ${OUTAGE_MIN_SAMPLES}+ minutes`));
            for (const outage of outages) {
                const minutes = Math.max(1, Math.round((outage.to - outage.from) / 60_000));
                console.log(`  ${clock(new Date(outage.from))} → ${clock(new Date(outage.to)).slice(11)}  ${minutes} min  ` +
                    (outage.routerAnswered ? "router answered: internet connection" : red("router silent too: local network")));
            }
            const gapMinutes = own.slice(1).filter((s, i) => s.t.getTime() - own[i].t.getTime() > 5 * 60_000).length;
            if (gapMinutes > 0) console.log(gray(`\n${gapMinutes} gaps of 5+ minutes without samples (Mac off or asleep, or the bridge stopped)`));
        }
    } finally {
        await closeDb();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
