/**
 * Reads back the browser logs stored by `POST /api/client-log` (#staff → Logging → "Send log
 * to server"), as a timeline in the console's own format. Reads the database the server's .env
 * names, like the other scripts here.
 *
 *   npm run logs -- --venue havremagasinet --stalls --since 24h   which visits stalled, and where
 *   npm run logs -- --setup <setupId>                             one visit's setup conversation
 *   npm run logs -- --meeting <id>                                one meeting
 *   npm run logs -- --page <pageId>                               everything one page load logged
 *   npm run logs -- --venue havremagasinet --since 2h --cat TURN,REALTIME,ERROR
 *   npm run logs -- --range                                       how far back the log reaches
 *
 * Also: --json (raw lines), --limit <n> (default 5000 lines), --utc (clock times in UTC).
 * --since takes 30m, 2h, 3d; it defaults to 24h unless a setup, meeting or page is named.
 */

import { blue, bold, cyan, gray, green, magenta, red, yellow } from "colorette";
import type { Filter } from "mongodb";
import type { ClientLogLine, LogCategory } from "@shared/ClientLogTypes.js";
import type { StoredClientLogBatch } from "@models/DBModels.js";
import { CLIENT_LOG_CAP_BYTES, clientLogCollection, closeDb, initDb } from "@services/DbService.js";

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

const CATEGORY_COLOR: Record<LogCategory, (text: string) => string> = {
    API: yellow,
    SOCKET: blue,
    AGENT: magenta,
    REALTIME: cyan,
    TURN: green,
    BUTTON: green,
    META: magenta,
    AUTOPLAY: yellow,
    PRINT: gray,
    SYSTEM: gray,
    ERROR: red,
};

function clock(t: number, utc: boolean): string {
    const date = new Date(t);
    const pad = (n: number, width = 2) => String(n).padStart(width, "0");
    return utc
        ? `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 23)}Z`
        : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
          `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
}

function formatLine(line: ClientLogLine, previousT: number | null, utc: boolean): string {
    const gap = previousT == null ? "" : `+${((line.t - previousT) / 1000).toFixed(1)}s`;
    const color = CATEGORY_COLOR[line.cat] ?? ((text: string) => text);
    const isStall = line.cat === "ERROR" && line.msg.startsWith("STALL ");
    const message = isStall ? bold(red(line.msg)) : line.msg;
    const data = line.data === undefined ? "" : ` ${gray(JSON.stringify(line.data))}`;
    return `${gray(clock(line.t, utc))} ${gray(gap.padStart(8))} ${color(`[${line.cat}]`)} ${message}${data}`;
}

async function printRange(): Promise<void> {
    const collection = clientLogCollection!;
    const [oldest] = await collection.find().sort({ receivedAt: 1 }).limit(1).toArray();
    const [newest] = await collection.find().sort({ receivedAt: -1 }).limit(1).toArray();
    const batches = await collection.estimatedDocumentCount();
    const [stats] = await collection
        .aggregate<{ storageStats?: { size?: number } }>([{ $collStats: { storageStats: {} } }])
        .toArray()
        .catch(() => []);
    const sizeMb = (stats?.storageStats?.size ?? 0) / 1024 / 1024;
    console.log(`${batches} batches, ${sizeMb.toFixed(1)} MB of ${CLIENT_LOG_CAP_BYTES / 1024 / 1024} MB`);
    if (oldest && newest) {
        console.log(`from ${oldest.receivedAt.toISOString()} to ${newest.receivedAt.toISOString()}`);
    }
}

async function main(): Promise<void> {
    const venue = arg("venue");
    const setup = arg("setup");
    const meetingArg = arg("meeting");
    const meeting = meetingArg ? Number(meetingArg) : undefined;
    const page = arg("page");
    const sinceArg = arg("since");
    const categories = arg("cat")?.split(",").map((c) => c.trim().toUpperCase());
    const stallsOnly = flag("stalls");
    const asJson = flag("json");
    const utc = flag("utc");
    const limit = Number(arg("limit") ?? 5000);

    await initDb();
    try {
        if (!clientLogCollection) throw new Error("client_log collection unavailable");
        if (flag("range")) {
            await printRange();
            return;
        }

        const filter: Filter<StoredClientLogBatch> = {};
        if (venue) filter.venueId = venue;
        if (setup) filter.setupIds = setup;
        if (meeting != null) filter.meetingIds = meeting;
        if (page) filter.pageId = page;
        const namesOne = setup != null || meeting != null || page != null;
        if (sinceArg || !namesOne) filter.receivedAt = { $gte: parseSince(sinceArg ?? "24h") };

        const batches = await clientLogCollection
            .find(filter)
            .sort({ receivedAt: 1, pageId: 1, seq: 1 })
            .toArray();

        type Row = { line: ClientLogLine; batch: StoredClientLogBatch };
        let rows: Row[] = batches.flatMap((batch) => batch.lines.map((line) => ({ line, batch })));
        // A batch names every visit any of its lines belongs to; keep only this one's lines.
        if (setup) rows = rows.filter(({ line }) => line.ctx?.setupId === setup);
        if (meeting != null) rows = rows.filter(({ line }) => line.ctx?.meetingId === meeting);
        if (categories) rows = rows.filter(({ line }) => categories.includes(line.cat));
        if (stallsOnly) rows = rows.filter(({ line }) => line.cat === "ERROR" && line.msg.startsWith("STALL "));
        rows.sort((a, b) => a.line.t - b.line.t);

        const lost = batches.reduce((sum, batch) => sum + (batch.dropped ?? 0), 0);
        if (rows.length > limit) {
            console.log(gray(`${rows.length} lines; showing the last ${limit} (--limit to change)`));
            rows = rows.slice(-limit);
        }

        if (asJson) {
            console.log(JSON.stringify(rows.map(({ line, batch }) => ({ ...line, pageId: batch.pageId, venueId: batch.venueId })), null, 2));
            return;
        }

        if (stallsOnly) {
            for (const { line, batch } of rows) {
                const data = (line.data ?? {}) as Record<string, unknown>;
                console.log(
                    `${clock(line.t, utc)}  ${red(line.msg.slice("STALL ".length))}  ` +
                        `venue ${batch.venueId ?? "-"}  setup ${line.ctx?.setupId ?? "-"}  ` +
                        `meeting ${line.ctx?.meetingId ?? "-"}  page ${batch.pageId}  ${gray(String(data.feature ?? ""))}`,
                );
            }
            if (rows.length > 0) console.log(gray("\nRead one with: npm run logs -- --setup <setupId>   (or --page <pageId>)"));
        } else {
            let previousPage: string | null = null;
            let previousT: number | null = null;
            for (const { line, batch } of rows) {
                if (batch.pageId !== previousPage) {
                    console.log(bold(`\n── page ${batch.pageId}${batch.venueId ? ` · ${batch.venueId}` : ""} ──`));
                    previousPage = batch.pageId;
                    previousT = null;
                }
                console.log(formatLine(line, previousT, utc));
                previousT = line.t;
            }
        }

        console.log(gray(`\n${rows.length} lines from ${batches.length} batches${lost ? `, ${lost} lines lost on the kiosk before sending` : ""}`));
    } finally {
        await closeDb();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
