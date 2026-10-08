import type { Request, Response } from "express";
import { z } from "zod";
import { isOffline, NETWORK_SAMPLE_LIMITS, type NetworkSample } from "@shared/networkSamples.js";
import type { Venue } from "@models/Venues.js";
import { networkSamplesCollection } from "@services/DbService.js";
import { sendReport } from "@utils/errorbot.js";
import { Logger } from "@utils/Logger.js";
import { findVenue } from "@utils/venues.js";

/**
 * Stores the network samples an installation's bridge takes once a minute, and tells the team
 * (ErrorBot) about internet outages they show. Samples taken during an outage only arrive once
 * it is over, so the report comes afterwards — with how long it lasted and whether the router
 * answered meanwhile, which says local network or internet connection.
 */

/** An outage shorter than this is a blip, not news. */
export const OUTAGE_MIN_SAMPLES = 2;
/** Samples older than this are not a backlog the bridge could have kept. */
const MAX_SAMPLE_AGE_MS = 2 * 24 * 60 * 60_000;
const MAX_CLOCK_AHEAD_MS = 5 * 60_000;

const text = z.string().max(NETWORK_SAMPLE_LIMITS.maxTextChars);
const ms = z.number().nonnegative().max(600_000);
const count = z.number().int().nonnegative().max(1_000_000_000);

const PingStatsSchema = z.strictObject({
    sent: z.number().int().nonnegative().max(100),
    received: z.number().int().nonnegative().max(100),
    avgMs: ms.nullable(),
    maxMs: ms.nullable(),
    jitterMs: ms.nullable(),
});

const NetworkSampleSchema = z.strictObject({
    t: z.iso.datetime({ offset: true }),
    iface: text.nullable(),
    link: text.nullable(),
    gateway: PingStatsSchema.nullable(),
    internet: PingStatsSchema,
    serverMs: ms.nullable(),
    inErrors: count.nullable(),
    outErrors: count.nullable(),
});

export const NetworkSampleBatchSchema = z.strictObject({
    venueId: z.string().min(1).max(100),
    host: z.string().max(200).optional(),
    samples: z.array(NetworkSampleSchema).min(1).max(NETWORK_SAMPLE_LIMITS.maxSamples),
});

export type Outage = { from: number; to: number; samples: number; routerAnswered: boolean };

/**
 * Runs of samples that reached neither the internet nor the server. `to` is the first sample
 * that got through again, or the run's last sample when the batch ends inside it.
 */
export function findOutages(samples: NetworkSample[]): Outage[] {
    const outages: Outage[] = [];
    let run: NetworkSample[] = [];
    const close = (next: NetworkSample | undefined) => {
        if (run.length >= OUTAGE_MIN_SAMPLES) {
            outages.push({
                from: Date.parse(run[0].t),
                to: Date.parse((next ?? run[run.length - 1]).t),
                samples: run.length,
                routerAnswered: run.some((sample) => (sample.gateway?.received ?? 0) > 0),
            });
        }
        run = [];
    };
    for (const sample of samples) {
        if (isOffline(sample)) run.push(sample);
        else close(sample);
    }
    close(undefined);
    return outages;
}

function clockAt(time: number, timeZone: string): string {
    return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(time));
}

export function describeOutages(venue: Venue, outages: Outage[], host?: string): string {
    const lines = outages.map((outage) => {
        const minutes = Math.max(1, Math.round((outage.to - outage.from) / 60_000));
        const where = outage.routerAnswered
            ? "router answered, so the internet connection itself"
            : "router did not answer either, so the local network (cable, switch or router)";
        return `${clockAt(outage.from, venue.timezone)}–${clockAt(outage.to, venue.timezone)} (${minutes} min): ${where}`;
    });
    return `[NETWORK] ${venue.name}: no internet\n${lines.join("\n")}${host ? `\n· ${host}` : ""}`;
}

export async function handleNetworkSamples(req: Request, res: Response): Promise<void> {
    const parsed = NetworkSampleBatchSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid network samples" });
        return;
    }
    const batch = parsed.data;
    const venue = findVenue(batch.venueId);
    if (!venue) {
        res.status(400).json({ message: `Unknown venue: ${batch.venueId}` });
        return;
    }
    const now = Date.now();
    if (batch.samples.some(({ t }) => now - Date.parse(t) > MAX_SAMPLE_AGE_MS || Date.parse(t) - now > MAX_CLOCK_AHEAD_MS)) {
        res.status(400).json({ message: "Invalid network samples" });
        return;
    }
    const collection = networkSamplesCollection;
    if (!collection) {
        res.status(503).json({ message: "Network samples unavailable" });
        return;
    }

    try {
        await collection.insertMany(batch.samples.map((sample) => ({
            ...sample,
            t: new Date(sample.t),
            venueId: venue.id,
            ...(batch.host ? { host: batch.host } : {}),
            receivedAt: new Date(now),
        })));
    } catch (error) {
        Logger.info("api", `POST /api/installation/network could not store samples: ${String(error)}`);
        res.status(500).json({ message: "Network samples not stored" });
        return;
    }

    const outages = findOutages(batch.samples);
    if (outages.length > 0) {
        await sendReport({
            context: `network ${venue.id}`,
            severity: "warning",
            source: "server",
            message: describeOutages(venue, outages, batch.host),
        });
    }
    res.status(204).end();
}
