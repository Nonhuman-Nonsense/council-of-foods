/**
 * Where the AI usage goes: every recorded call (`usage_events`), summed by feature and model,
 * and how much of each conversation's input was served from a prompt cache. Reads the
 * database the server's .env names, like the other scripts here.
 *
 *   npm run usage                                the last 30 days
 *   npm run usage -- --since 7d --venue havremagasinet
 *   npm run usage -- --feature setup-agent --days   the same, day by day
 *
 * Also: --json (the summed rows). --since takes 30m, 2h, 3d; it defaults to 30d.
 *
 * Reading it: "per conv." is one setup (setup agent) or one meeting (everything else), so a
 * growing "input/call" with a low "cached" share is a conversation resent at full price every
 * turn. `cached` is input read from a cache and `writes` input written to one (Anthropic bills
 * writes above the plain input price); probed for Claude, realtime and routed, they are
 * reported apart. Inworld's router docs show a Gemini write counted in both.
 */

import { bold, gray, yellow } from "@utils/colors.js";
import type { Filter } from "mongodb";
import type { StoredUsageEvent } from "@models/DBModels.js";
import { closeDb, initDb, usageEventsCollection } from "@services/DbService.js";

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

/** 12345678 → "12.3M", so columns of very different sizes stay readable. */
function amount(value: number | undefined): string {
    if (!value) return "-";
    if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e4) return `${(value / 1e3).toFixed(0)}k`;
    if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
    return String(Math.round(value));
}

/** Share of the input that came from a cache, flagged when a large input is barely cached. */
function cachedShare(input: number, cached: number): string {
    if (!input) return "-";
    const text = `${Math.round((cached / input) * 100)}%`;
    return cached / input < 0.2 && input > 1e5 ? yellow(text) : text;
}

function median(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
}

interface Row {
    feature: string;
    model: string;
    day?: string;
    calls: number;
    conversations: number;
    callsPerConversation: number[];
    inputPerConversation: number[];
    input: number;
    cached: number;
    writes: number;
    output: number;
    reasoning: number;
    characters: number;
    audioSeconds: number;
}

async function main(): Promise<void> {
    const since = parseSince(arg("since") ?? "30d");
    const venue = arg("venue");
    const feature = arg("feature");
    const byDay = flag("days");

    await initDb(undefined, undefined, { readOnly: true });
    try {
        if (!usageEventsCollection) throw new Error("usage_events collection unavailable");
        const filter: Filter<StoredUsageEvent> = { ts: { $gte: since } };
        if (venue) filter.venueId = venue;
        if (feature) filter.feature = feature as StoredUsageEvent["feature"];

        // One group per conversation first, so calls and input per setup or meeting fall out of
        // the same pass as the totals.
        const perConversation = await usageEventsCollection.aggregate<{
            _id: { feature: string; model: string; day?: string; conversation: string | number | null };
            calls: number; input: number; cached: number; writes: number; output: number;
            reasoning: number; characters: number; audioSeconds: number;
        }>([
            { $match: filter },
            {
                $group: {
                    _id: {
                        feature: "$feature",
                        model: "$model",
                        ...(byDay ? { day: { $dateToString: { format: "%Y-%m-%d", date: "$ts" } } } : {}),
                        conversation: { $ifNull: ["$setupId", { $ifNull: ["$meetingId", null] }] },
                    },
                    calls: { $sum: 1 },
                    input: { $sum: "$measures.input_tokens" },
                    cached: { $sum: "$measures.cached_input_tokens" },
                    writes: { $sum: "$measures.cache_write_tokens" },
                    output: { $sum: "$measures.output_tokens" },
                    reasoning: { $sum: "$measures.reasoning_tokens" },
                    characters: { $sum: "$measures.characters" },
                    audioSeconds: { $sum: "$measures.audio_seconds" },
                },
            },
        ]).toArray();

        const rows = new Map<string, Row>();
        for (const group of perConversation) {
            const { feature, model, day } = group._id;
            const key = `${day ?? ""}|${feature}|${model}`;
            const row = rows.get(key) ?? {
                feature, model, day, calls: 0, conversations: 0, callsPerConversation: [], inputPerConversation: [],
                input: 0, cached: 0, writes: 0, output: 0, reasoning: 0, characters: 0, audioSeconds: 0,
            };
            row.calls += group.calls;
            row.input += group.input;
            row.cached += group.cached;
            row.writes += group.writes;
            row.output += group.output;
            row.reasoning += group.reasoning;
            row.characters += group.characters;
            row.audioSeconds += group.audioSeconds;
            if (group._id.conversation !== null) {
                row.conversations += 1;
                row.callsPerConversation.push(group.calls);
                row.inputPerConversation.push(group.input);
            }
            rows.set(key, row);
        }

        const sorted = [...rows.values()].sort((a, b) =>
            (a.day ?? "").localeCompare(b.day ?? "") || b.input - a.input || b.characters - a.characters);

        if (flag("json")) {
            console.log(JSON.stringify(sorted, null, 2));
            return;
        }
        if (sorted.length === 0) {
            console.log(gray(`No usage${venue ? ` for ${venue}` : ""} since ${since.toISOString().slice(0, 16)}.`));
            return;
        }

        console.log(bold(`\n── usage since ${since.toISOString().slice(0, 16).replace("T", " ")}` +
            `${venue ? ` · ${venue}` : ""}${feature ? ` · ${feature}` : ""} ──\n`));
        printTable(
            [...(byDay ? ["day"] : []), "feature", "model", "calls", "conv.", "calls/conv.", "input", "input/call",
                "input/conv.", "cached", "writes", "output", "reasoning", "chars", "audio s"],
            sorted.map((row) => [
                ...(byDay ? [row.day ?? ""] : []),
                row.feature,
                row.model || gray("?"),
                String(row.calls),
                row.conversations ? String(row.conversations) : "-",
                row.conversations ? String(median(row.callsPerConversation)) : "-",
                amount(row.input),
                amount(row.input / row.calls),
                row.conversations ? amount(median(row.inputPerConversation)) : "-",
                cachedShare(row.input, row.cached),
                amount(row.writes),
                amount(row.output),
                amount(row.reasoning),
                amount(row.characters),
                amount(row.audioSeconds),
            ]),
        );
        console.log(gray("\ncalls/conv. and input/conv. are medians; cached is the share of input; tokens and characters are as the provider reported them."));
    } finally {
        await closeDb();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
