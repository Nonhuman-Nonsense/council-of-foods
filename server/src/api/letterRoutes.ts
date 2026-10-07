import express, { type Express, type Request, type Response } from "express";
import { z } from "zod";
import { config } from "@root/src/config.js";
import { getGlobalOptions } from "@logic/GlobalOptions.js";
import {
    letterBlocklistCollection,
    letterRepliesCollection,
    lettersCollection,
    meetingsCollection,
} from "@services/DbService.js";
import { keyMatches } from "@utils/sharedKey.js";
import { sendEmail } from "@services/MailService.js";
import { Logger } from "@utils/Logger.js";
import { loadRecipients, loadTopicIds } from "@logic/letters/recipients.js";
import {
    markReplyPrinted,
    receiveDeliveryEvents,
    receiveReplies,
    repliesToPrint,
    type DeliveryEvent,
    type InboundEmail,
} from "@logic/letters/replies.js";
import type { LetterReply } from "@models/DBModels.js";
import type { PrintableLetterReply } from "@shared/ModelTypes.js";
import { requireInstallationKey } from "./installationKey.js";

/**
 * What comes back to the letters (docs/council-letters.md → Receiving).
 *
 * Brevo posts to two webhooks with COUNCIL_LETTERS_WEBHOOK_SECRET as its token
 * (`Authorization: Bearer <secret>`, Brevo's "Token" authentication):
 * - `POST /api/letters/brevo/inbound` — emails to the reply domain, `{ items: [...] }`;
 * - `POST /api/letters/brevo/events` — transactional delivery events, one or a list.
 *
 * An installation's bridge, with the installation key, prints the replies:
 * - `GET  /api/installation/letter-replies?venueId=…` — replies and opt-outs not yet printed;
 * - `POST /api/installation/letter-replies/printed {id}` — that one is printed.
 */

/** An inbound email can be large (HTML, a long thread); the rest of the API keeps express's default. */
const WEBHOOK_BODY_LIMIT = "20mb";

function secretMatches(req: Request, res: Response): boolean {
    const expected = config.COUNCIL_LETTERS_WEBHOOK_SECRET;
    if (!expected) {
        res.status(503).json({ message: "COUNCIL_LETTERS_WEBHOOK_SECRET is not set on this server" });
        return false;
    }
    const token = (req.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!keyMatches(token, expected)) {
        res.sendStatus(401);
        return false;
    }
    return true;
}

const replyDeps = () => ({
    meetings: meetingsCollection,
    letters: lettersCollection,
    replies: letterRepliesCollection,
    blocklist: letterBlocklistCollection,
    options: getGlobalOptions(),
    loadRecipients: async () => loadRecipients(await loadTopicIds()),
    ...(config.COUNCIL_LETTERS_ARCHIVE_TO ? { archive: { to: config.COUNCIL_LETTERS_ARCHIVE_TO, send: sendEmail } } : {}),
});

/** What a bridge prints: the reply, who sent it, and the letter it answers. */
function printView(reply: LetterReply): PrintableLetterReply {
    return {
        id: reply._id,
        meetingId: reply.meetingId,
        kind: reply.kind === "opt-out" ? "opt-out" : "reply",
        fromName: reply.from.name,
        fromAddress: reply.from.address,
        subject: reply.subject,
        message: reply.message,
        receivedAt: reply.receivedAt.toISOString(),
        letter: reply.letter,
    };
}

/**
 * Registered before the app's own JSON parser, with a larger body limit of its own: Brevo's
 * inbound posts carry whole emails.
 */
export function registerLetterWebhookRoutes(app: Express): void {
    const json = express.json({ limit: WEBHOOK_BODY_LIMIT });

    app.post("/api/letters/brevo/inbound", json, async (req: Request, res: Response) => {
        if (!secretMatches(req, res)) return;
        const items = (req.body as { items?: InboundEmail[] } | undefined)?.items;
        if (!Array.isArray(items)) {
            res.status(400).json({ message: "expected { items: [...] }" });
            return;
        }
        try {
            const kept = await receiveReplies(replyDeps(), items);
            res.json({ ok: true, kept });
        } catch (error) {
            // A 5xx makes Brevo post again; an email kept before the failure is not kept twice.
            await Logger.error("letters", "receiving replies failed", { error });
            res.status(500).json({ message: "could not receive replies" });
        }
    });

    app.post("/api/letters/brevo/events", json, async (req: Request, res: Response) => {
        if (!secretMatches(req, res)) return;
        const body = req.body as DeliveryEvent | DeliveryEvent[] | undefined;
        try {
            const blocked = await receiveDeliveryEvents(replyDeps(), Array.isArray(body) ? body : body ? [body] : []);
            res.json({ ok: true, blocked });
        } catch (error) {
            await Logger.error("letters", "receiving delivery events failed", { error });
            res.status(500).json({ message: "could not receive events" });
        }
    });
}

const PrintedBody = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) });

export function registerLetterInstallationRoutes(app: Express): void {
    app.get("/api/installation/letter-replies", requireInstallationKey, async (req: Request, res: Response) => {
        const venueId = typeof req.query.venueId === "string" ? req.query.venueId : "";
        if (!venueId) {
            res.status(400).json({ message: "expected ?venueId=" });
            return;
        }
        res.json({ replies: (await repliesToPrint(letterRepliesCollection, venueId)).map(printView) });
    });

    app.post("/api/installation/letter-replies/printed", requireInstallationKey, async (req: Request, res: Response) => {
        const parsed = PrintedBody.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ message: "expected { id }" });
            return;
        }
        const found = await markReplyPrinted(letterRepliesCollection, parsed.data.id);
        res.status(found ? 200 : 404).json({ ok: found });
    });
}
