import type { Express, Request, Response } from "express";
import { createHash } from "node:crypto";
import type { StoredAudio } from "@models/DBModels.js";
import { audioCollection } from "@services/DbService.js";
import type { PublicAudioClipResponse } from "@shared/SocketTypes.js";
import { Logger } from "@utils/Logger.js";

const CACHE_CONTROL = "public, max-age=86400, immutable";

/** Same extraction rules as `AudioSystem.generateAudio` when reading legacy rows. */
function extractAudioBuffer(row: unknown): Buffer | null {
    if (!row || typeof row !== "object") return null;
    const doc = row as Record<string, unknown>;

    for (const key of ["buffer", "audio"] as const) {
        const v = doc[key];
        if (v == null) continue;
        if (Buffer.isBuffer(v)) return v;
        if (typeof v === "object" && "buffer" in v) {
            const inner = (v as { buffer?: ArrayBufferLike }).buffer;
            if (inner) return Buffer.from(inner);
        }
    }
    return null;
}

function isSafeAudioId(raw: string): boolean {
    if (raw.length === 0 || raw.length > 256) return false;
    return !/[\\/]/.test(raw);
}

/**
 * Public audio clip for replay: one document from `audio` collection by message id (`_id`).
 */
export function registerAudioRoutes(app: Express): void {
    app.get("/api/audio/:audioId", async (req: Request, res: Response) => {
        const audioId = req.params.audioId;
        if (typeof audioId !== "string" || !isSafeAudioId(audioId)) {
            res.status(400).json({ message: "Invalid audio id" });
            return;
        }

        try {
            const row = await audioCollection.findOne({ _id: audioId });
            if (!row) {
                res.status(404).json({ message: "Not found" });
                return;
            }

            const stored = row as StoredAudio & { type?: string };
            const audioBuf = extractAudioBuffer(stored);
            if (!audioBuf || audioBuf.length === 0) {
                res.status(404).json({ message: "Not found" });
                return;
            }

            const etag = `"${createHash("sha256").update(audioBuf).digest("hex").slice(0, 32)}"`;
            if (req.headers["if-none-match"] === etag) {
                res.setHeader("Cache-Control", CACHE_CONTROL);
                res.setHeader("ETag", etag);
                res.sendStatus(304);
                return;
            }

            const body: PublicAudioClipResponse = {
                id: audioId,
                type: stored.type,
                sentences: stored.sentences,
                audioBase64: audioBuf.toString("base64"),
            };

            res.setHeader("Cache-Control", CACHE_CONTROL);
            res.setHeader("ETag", etag);
            res.status(200).type("application/json").json(body);
        } catch (e: unknown) {
            await Logger.error("api", `GET /api/audio/${audioId} failed`, e);
            res.status(500).json({ message: "Internal Server Error" });
        }
    });
}
