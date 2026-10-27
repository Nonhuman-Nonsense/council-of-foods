import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "http";
import { letterBlocklistCollection, letterRepliesCollection, lettersCollection, meetingsCollection } from "@services/DbService.js";
import { markReplyPrinted, receiveDeliveryEvents, receiveReplies, repliesToPrint, type InboundEmail, type ReplyDeps } from "@logic/letters/replies.js";
import type { OutboxLetter } from "@models/DBModels.js";
import { MockFactory } from "./factories/MockFactory.js";
import { Logger } from "@utils/Logger.js";

/**
 * What comes back to the letters (docs/council-letters.md → Receiving): replies are kept with the
 * letter they answer and sorted; opt-outs, bounces and spam complaints put the recipient on the
 * blocklist; replies and opt-outs are printed once at the letter's venue.
 */

const mockConfig = vi.hoisted(() => ({
    COUNCIL_LETTERS_WEBHOOK_SECRET: "webhook-secret-for-tests-0123" as string | undefined,
    COUNCIL_INSTALLATION_KEY: "installation-key-for-tests-0123",
    COUNCIL_DB_PREFIX: "council-test",
}));
vi.mock("@root/src/config.js", () => ({ config: mockConfig }));

const { registerLetterInstallationRoutes, registerLetterWebhookRoutes } = await import("@api/letterRoutes.js");

const REPLY_DOMAIN = "reply.council-of-forest.com";
const TOKEN = "9f3ac2e1";

async function sentLetter(_id: number, overrides: Partial<OutboxLetter> = {}) {
    const meeting = MockFactory.createStoredMeeting({
        _id, liveKey: `key-${_id}`, language: "sv",
        letter: { authorId: "reindeer", recipientId: "skogsstyrelsen", send: true, finishedAt: new Date().toISOString() },
    });
    meeting.characters = [...meeting.characters.filter((c) => c.id !== "reindeer"), MockFactory.createCharacter({ id: "reindeer", name: "Renen" })];
    await meetingsCollection.insertOne(meeting);
    await lettersCollection.insertOne({
        _id, status: "sent", mode: "live", recipientId: "skogsstyrelsen", recipientKind: "institution", to: "registrator@example.org",
        from: { name: "Renen", email: "reindeer@council-of-forest.com" }, replyTo: `reindeer.${_id}.${TOKEN}@${REPLY_DOMAIN}`, replyToken: TOKEN,
        subject: "Tre veckor", text: "…", venueId: "havremagasinet", queuedAt: new Date(), sentAt: new Date(), ...overrides,
    });
}

const email = (meetingId: number, overrides: Partial<InboundEmail> = {}): InboundEmail => ({
    MessageId: `<reply-${meetingId}-${Math.random()}@skogsstyrelsen.se>`,
    From: { Address: "anna.andersson@skogsstyrelsen.se", Name: "Anna Andersson" },
    To: [{ Address: `reindeer.${meetingId}.${TOKEN}@${REPLY_DOMAIN}` }],
    Subject: "Re: Tre veckor",
    ExtractedMarkdownMessage: "Tack för brevet. Ring mig gärna på 070-123 45 67.",
    SpamScore: 1,
    Headers: {},
    ...overrides,
});

function deps(classifyAs: "reply" | "opt-out" | "automatic" = "reply"): ReplyDeps & { classify: ReturnType<typeof vi.fn> } {
    return {
        meetings: meetingsCollection,
        letters: lettersCollection,
        replies: letterRepliesCollection,
        blocklist: letterBlocklistCollection,
        options: { letterReplyDomain: REPLY_DOMAIN } as ReplyDeps["options"],
        loadRecipients: async () => [{ id: "skogsstyrelsen", name: "Skogsstyrelsen" } as never],
        classify: vi.fn(async () => ({ kind: classifyAs, reason: "test" })),
    } as ReplyDeps & { classify: ReturnType<typeof vi.fn> };
}

describe("letter replies", () => {
    beforeEach(async () => {
        await lettersCollection.deleteMany({});
        await letterRepliesCollection.deleteMany({});
        await letterBlocklistCollection.deleteMany({});
    });

    it("keeps a reply with the letter it answers, without the sender's contact details", async () => {
        await sentLetter(1400);

        expect(await receiveReplies(deps(), [email(1400)])).toBe(1);

        const [reply] = await repliesToPrint(letterRepliesCollection, "havremagasinet");
        expect(reply).toMatchObject({
            meetingId: 1400, kind: "reply", from: { name: "Anna Andersson" },
            letter: { authorName: "Renen", recipientName: "Skogsstyrelsen", subject: "Tre veckor", language: "sv" },
        });
        expect(reply.message).toContain("Tack för brevet.");
        expect(reply.message).not.toContain("070-123 45 67");
    });

    it("takes a real reply Brevo's spam score only half-suspects as a reply", async () => {
        await sentLetter(1400);

        await receiveReplies(deps(), [email(1400, { SpamScore: 6.09 })]);

        expect(await letterRepliesCollection.findOne({})).toMatchObject({ kind: "reply" });
    });

    describe("copies to the archive", () => {
        const archived = (copies: ReturnType<typeof vi.fn>) => copies.mock.calls.map(([copy]) => copy);

        it("sends a copy of each reply once, labelled, answering the person who wrote", async () => {
            await sentLetter(1400);
            const send = vi.fn(async () => "id");
            const same = email(1400);

            await receiveReplies({ ...deps(), archive: { to: "archive@example.org", send } }, [same]);
            await receiveReplies({ ...deps(), archive: { to: "archive@example.org", send } }, [same]);

            expect(archived(send)).toEqual([expect.objectContaining({
                to: ["archive@example.org"],
                subject: expect.stringMatching(/^\[reply · meeting 1400 · Renen → Skogsstyrelsen\] Re: Tre veckor/),
                replyTo: "anna.andersson@skogsstyrelsen.se",
                text: expect.stringContaining("Tack för brevet."),
            })]);
        });

        it("copies automatic replies and spam too, and still keeps a reply when the copy fails", async () => {
            vi.spyOn(Logger, "error").mockResolvedValue(undefined);
            await sentLetter(1400);
            const send = vi.fn().mockRejectedValueOnce(new Error("Brevo down")).mockResolvedValue("id");

            await receiveReplies({ ...deps(), archive: { to: "archive@example.org", send } }, [
                email(1400),
                email(1400, { SpamScore: 20 }),
            ]);

            expect(await letterRepliesCollection.countDocuments()).toBe(2);
            expect(archived(send).map((copy) => copy.subject.split(" ")[0])).toEqual(["[reply", "[spam"]);
        });

        it("tells the archive once when a recipient goes on the blocklist", async () => {
            await sentLetter(1400);
            const send = vi.fn(async () => "id");
            const event = { event: "hard_bounce", email: "registrator@example.org", tags: ["letter-1400"] };

            await receiveDeliveryEvents({ ...deps(), archive: { to: "archive@example.org", send } }, [event, event]);

            expect(archived(send)).toEqual([expect.objectContaining({ subject: "[blocklist · meeting 1400] skogsstyrelsen (bounce)" })]);
        });
    });

    it("keeps an email Brevo posts twice only once", async () => {
        await sentLetter(1400);
        const same = email(1400);

        await receiveReplies(deps(), [same]);
        await receiveReplies(deps(), [same]);

        expect(await letterRepliesCollection.countDocuments()).toBe(1);
    });

    it("puts whoever opts out on the blocklist, and still prints what they wrote", async () => {
        await sentLetter(1400);

        await receiveReplies(deps("opt-out"), [email(1400, { ExtractedMarkdownMessage: "Skicka inga fler brev, tack." })]);

        expect(await letterBlocklistCollection.findOne({ _id: "skogsstyrelsen" })).toMatchObject({ reason: "opt-out", meetingId: 1400 });
        expect((await repliesToPrint(letterRepliesCollection, "havremagasinet")).map((r) => r.kind)).toEqual(["opt-out"]);
    });

    it.each([
        ["an automatic reply its headers announce", { Headers: { "Auto-Submitted": "auto-replied" } }, "automatic"],
        ["spam", { SpamScore: 20 }, "spam"],
    ] as const)("keeps %s unasked and unprinted", async (_label, overrides, kind) => {
        await sentLetter(1400);
        const sorting = deps();

        await receiveReplies(sorting, [email(1400, overrides)]);

        expect(sorting.classify).not.toHaveBeenCalled();
        expect(await letterRepliesCollection.findOne({})).toMatchObject({ kind });
        expect(await repliesToPrint(letterRepliesCollection, "havremagasinet")).toEqual([]);
    });

    it("drops an email that answers no letter of ours", async () => {
        expect(await receiveReplies(deps(), [email(999)])).toBe(0);
        expect(await letterRepliesCollection.countDocuments()).toBe(0);
    });

    it.each([
        ["without the letter's token", `reindeer.1400@${REPLY_DOMAIN}`],
        ["with another token", `reindeer.1400.00000000@${REPLY_DOMAIN}`],
    ])("drops an email to a guessed address — %s — so nobody can get words printed", async (_label, address) => {
        await sentLetter(1400);

        expect(await receiveReplies(deps(), [email(1400, { To: [{ Address: address }] })])).toBe(0);
    });

    it("prints a reply once, at its letter's venue — or anywhere when the letter had none", async () => {
        await sentLetter(1, { venueId: "havremagasinet" });
        await sentLetter(2, { venueId: "other-museum" });
        await sentLetter(3, { venueId: undefined });
        await receiveReplies(deps(), [email(1), email(2), email(3)]);

        const toPrint = await repliesToPrint(letterRepliesCollection, "havremagasinet");
        expect(toPrint.map((r) => r.meetingId).sort()).toEqual([1, 3]);

        await markReplyPrinted(letterRepliesCollection, toPrint[0]._id);
        expect(await repliesToPrint(letterRepliesCollection, "havremagasinet")).toHaveLength(1);
    });

    it.each([
        ["a hard bounce of a letter sent live", "hard_bounce", "live", "bounce"],
        ["a spam complaint", "spam", "live", "complaint"],
        ["a hard bounce of a test letter", "hard_bounce", "test", null],
        ["a delivery", "delivered", "live", null],
        ["a hard bounce of another email the account sent", "hard_bounce", "live", null, "staff@example-museum.org"],
    ] as const)("%s → blocklist: %s", async (_label, event, mode, reason, address: string = "registrator@example.org") => {
        await sentLetter(1400, { mode });

        await receiveDeliveryEvents(deps(), [{ event, email: address, tags: ["letter-1400"] }]);

        const blocked = await letterBlocklistCollection.findOne({ _id: "skogsstyrelsen" });
        if (reason) expect(blocked).toMatchObject({ reason });
        else expect(blocked).toBeNull();
    });

    describe("over HTTP", () => {
        let server: http.Server;
        let base: string;

        beforeAll(async () => {
            const app = express();
            registerLetterWebhookRoutes(app);
            app.use(express.json());
            registerLetterInstallationRoutes(app);
            server = http.createServer(app);
            await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
            const address = server.address();
            base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
        });
        afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

        const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
            fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

        it("refuses every webhook post while no secret is set", async () => {
            mockConfig.COUNCIL_LETTERS_WEBHOOK_SECRET = undefined;
            expect((await post("/api/letters/brevo/inbound", { items: [] }, { Authorization: "Bearer anything" })).status).toBe(503);
            mockConfig.COUNCIL_LETTERS_WEBHOOK_SECRET = "webhook-secret-for-tests-0123";
        });

        it.each([
            ["the secret as a token", "/api/letters/brevo/events", { Authorization: "Bearer webhook-secret-for-tests-0123" }, 200],
            ["a wrong token", "/api/letters/brevo/events", { Authorization: "Bearer not-the-secret-0123456789" }, 401],
            ["no token", "/api/letters/brevo/events", {}, 401],
        ])("takes Brevo's post with %s → %s", async (_label, path, headers, status) => {
            expect((await post(path, { event: "delivered" }, headers)).status).toBe(status);
        });

        it("hands the bridge the replies to print, with its key, and who sent them", async () => {
            await sentLetter(1400);
            await receiveReplies(deps(), [email(1400)]);
            const key = { "X-Installation-Key": "installation-key-for-tests-0123" };

            expect((await fetch(`${base}/api/installation/letter-replies?venueId=havremagasinet`)).status).toBe(401);
            const response = await fetch(`${base}/api/installation/letter-replies?venueId=havremagasinet`, { headers: key });
            const { replies } = await response.json() as { replies: Array<{ id: string; fromName: string; fromAddress: string }> };
            expect(replies).toHaveLength(1);
            expect(replies[0].fromName).toBe("Anna Andersson");
            expect(replies[0].fromAddress).toMatch(/^anna\.andersson@/);

            expect((await post("/api/installation/letter-replies/printed", { id: replies[0].id }, key)).status).toBe(200);
            const after = await (await fetch(`${base}/api/installation/letter-replies?venueId=havremagasinet`, { headers: key })).json();
            expect(after.replies).toEqual([]);
        });
    });
});
