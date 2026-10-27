import { beforeEach, describe, expect, it, vi } from "vitest";
import { letterBlocklistCollection, lettersCollection, meetingsCollection } from "@services/DbService.js";
import { queueFinishedLetters, recoverInterruptedSends, runOutbox, sendNextLetter, type OutboxDeps } from "@logic/letters/outbox.js";
import { BrevoRefusedError } from "@services/MailService.js";
import { loadLetterHistory } from "@logic/letters/history.js";
import { Logger } from "@utils/Logger.js";
import type { Recipient } from "@logic/letters/recipients.js";
import type { MeetingLetter } from "@models/DBModels.js";
import { MockFactory } from "./factories/MockFactory.js";

/**
 * The outbox (docs/council-letters.md → Outbox): finished letters are queued once, and sent at
 * most once, from the being that wrote them — or not at all, depending on the sending mode, the
 * blocklist, whether a person already had their letter, and the daily ceiling.
 */

const recipient = (id: string, kind: Recipient["kind"] = "institution"): Recipient => ({
    id, name: id, kind, category: kind === "person" ? "parliament" : "agency", email: `${id}@example.org`,
    language: "sv", remit: "", why: "", topics: ["forestry"], active: true, facts: [],
});
const RECIPIENTS = [recipient("skogsstyrelsen"), recipient("mp-anna", "person")];

const letter = (overrides: Partial<MeetingLetter> = {}): MeetingLetter => ({
    authorId: "reindeer", recipientId: "skogsstyrelsen", points: ["ask"], form: "note", asksReply: false,
    present: true, finishedAt: new Date().toISOString(), subject: "Three weeks",
    body: "Dear Skogsstyrelsen, I am a reindeer of Juhttátahkka, and I write from Council of Forest.",
    humanNote: null, footer: "—\n\nThe meeting: https://council-of-forest.com/sv/meeting/1", handling: "none",
    humanContributed: false, send: true, sendReason: null, ...overrides,
});

async function finishedMeeting(_id: number, overrides: Partial<MeetingLetter> = {}) {
    const meeting = MockFactory.createStoredMeeting({ _id, liveKey: `key-${_id}`, language: "sv", letter: letter(overrides) });
    // The author by its name in the meeting's language, whatever the product's own beings are.
    meeting.characters = [
        ...meeting.characters.filter((character) => character.id !== "reindeer"),
        MockFactory.createCharacter({ id: "reindeer", name: "Renen" }),
    ];
    await meetingsCollection.insertOne(meeting);
}

function deps(overrides: Partial<OutboxDeps> = {}): OutboxDeps & { send: ReturnType<typeof vi.fn> } {
    return {
        meetings: meetingsCollection,
        letters: lettersCollection,
        blocklist: letterBlocklistCollection,
        options: {
            letterSiteUrl: "https://council-of-forest.com",
            letterSenderDomain: "council-of-forest.com",
            letterReplyDomain: "reply.council-of-forest.com",
            letterSenderAddresses: {},
            letterDailyLimit: 5,
        },
        loadRecipients: async () => RECIPIENTS,
        send: vi.fn(async () => "brevo-message-1"),
        findSent: vi.fn(async () => null),
        mode: "live",
        testTo: "hello@example.org",
        ...overrides,
    } as OutboxDeps & { send: ReturnType<typeof vi.fn> };
}

describe("letter outbox", () => {
    beforeEach(async () => {
        await lettersCollection.deleteMany({});
        await letterBlocklistCollection.deleteMany({});
        vi.restoreAllMocks();
    });

    it("queues each finished letter marked to send exactly once, and nothing else", async () => {
        await finishedMeeting(1);
        await finishedMeeting(2, { send: false, present: false });
        const outbox = deps({ mode: "off" });

        expect(await queueFinishedLetters(outbox)).toBe(1);
        expect(await queueFinishedLetters(outbox)).toBe(0);

        expect(await lettersCollection.find({}).toArray()).toEqual([
            expect.objectContaining({
                _id: 1, status: "queued", to: "skogsstyrelsen@example.org",
                from: { name: "Renen", email: "reindeer@council-of-forest.com" },
                replyTo: expect.stringMatching(/^reindeer\.1\.[a-f0-9]{8}@reply\.council-of-forest\.com$/),
            }),
        ]);
    });

    it("refuses a letter the last check catches, and reports it", async () => {
        const error = vi.spyOn(Logger, "error").mockResolvedValue(undefined);
        await finishedMeeting(1, { body: "Dear Skogsstyrelsen, write to kalle.svensson@gmail.com about the reindeer, please." });

        await runOutbox(deps());

        expect(await lettersCollection.findOne({ _id: 1 })).toMatchObject({ status: "refused", reason: expect.stringMatching(/email address/) });
        expect(error).toHaveBeenCalled();
    });

    it.each([
        ["off: queued, nothing sent", "off", 0, "queued", undefined],
        ["test: sent to our own inbox", "test", 1, "sent", "hello@example.org"],
        ["live: sent to the recipient", "live", 1, "sent", "skogsstyrelsen@example.org"],
    ] as const)("%s", async (_label, mode, sends, status, to) => {
        await finishedMeeting(1);
        const outbox = deps({ mode });

        await runOutbox(outbox);

        expect(outbox.send).toHaveBeenCalledTimes(sends);
        if (to) {
            expect(outbox.send).toHaveBeenCalledWith(expect.objectContaining({
                to: [to], sender: { name: "Renen", email: "reindeer@council-of-forest.com" }, replyTo: expect.stringMatching(/^reindeer\.1\.[a-f0-9]{8}@reply\.council-of-forest\.com$/),
            }));
        }
        expect(await lettersCollection.findOne({ _id: 1 })).toMatchObject({ status, ...(sends ? { mode } : {}) });
    });

    it.each([
        ["live: a hidden copy to the archive", "live", ["archive@example.org"]],
        ["test: none, the letter itself already comes to us", "test", undefined],
    ] as const)("%s", async (_label, mode, bcc) => {
        await finishedMeeting(1);
        const outbox = deps({ mode, archiveTo: "archive@example.org" });

        await runOutbox(outbox);

        expect(outbox.send.mock.calls[0][0].bcc).toEqual(bcc);
    });

    it("never sends a letter twice, however often the worker runs", async () => {
        await finishedMeeting(1);
        await queueFinishedLetters(deps());
        // A slow Brevo: the other turns try to claim while the first send is still under way.
        const outbox = deps({ send: vi.fn(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); return "id"; }) });

        await Promise.all([runOutbox(outbox), runOutbox(outbox), runOutbox(outbox)]);

        expect(outbox.send).toHaveBeenCalledTimes(1);
    });

    it("skips a recipient on the blocklist", async () => {
        await finishedMeeting(1);
        await letterBlocklistCollection.insertOne({ _id: "skogsstyrelsen", reason: "opt-out", at: new Date() });
        const outbox = deps();

        await runOutbox(outbox);

        expect(outbox.send).not.toHaveBeenCalled();
        expect(await lettersCollection.findOne({ _id: 1 })).toMatchObject({ status: "skipped", reason: expect.stringMatching(/blocklist/) });
    });

    it("sends a person only one letter, even when two meetings chose them at once", async () => {
        await finishedMeeting(1, { recipientId: "mp-anna" });
        await finishedMeeting(2, { recipientId: "mp-anna" });
        const outbox = deps();

        await runOutbox(outbox);

        expect(outbox.send).toHaveBeenCalledTimes(1);
        expect((await lettersCollection.find({}).toArray()).map((l) => l.status).sort()).toEqual(["sent", "skipped"]);
    });

    it("marks a letter Brevo refused as failed, reports it, and goes on with the next", async () => {
        const error = vi.spyOn(Logger, "error").mockResolvedValue(undefined);
        await finishedMeeting(1);
        await finishedMeeting(2);
        const outbox = deps({ send: vi.fn().mockRejectedValueOnce(new BrevoRefusedError(400, "invalid recipient")).mockResolvedValue("id-2") });

        await runOutbox(outbox);

        expect(await lettersCollection.findOne({ _id: 1 })).toMatchObject({ status: "failed", reason: expect.stringMatching(/400/) });
        expect(await lettersCollection.findOne({ _id: 2 })).toMatchObject({ status: "sent" });
        expect(error).toHaveBeenCalled();
    });

    it("sends a letter again after a temporary Brevo error, and gives up after a few", async () => {
        vi.spyOn(Logger, "error").mockResolvedValue(undefined);
        await finishedMeeting(1);
        const outbox = deps({ send: vi.fn().mockRejectedValue(new BrevoRefusedError(503, "busy")) });

        await runOutbox(outbox);

        expect(outbox.send).toHaveBeenCalledTimes(3);
        expect(await lettersCollection.findOne({ _id: 1 })).toMatchObject({ status: "failed", attempts: 3 });
    });

    describe("a send interrupted with no answer from Brevo", () => {
        const at = (minutes: number) => () => new Date(Date.UTC(2026, 9, 10, 12, minutes));

        async function interrupted() {
            await finishedMeeting(1);
            await runOutbox(deps({ now: at(0), send: vi.fn().mockRejectedValue(new Error("The operation was aborted due to timeout")) }));
        }

        it("is neither failed nor reported: it may have gone out", async () => {
            const error = vi.spyOn(Logger, "error").mockResolvedValue(undefined);
            await interrupted();

            expect(await lettersCollection.findOne({ _id: 1 })).toMatchObject({ status: "sending" });
            expect(error).not.toHaveBeenCalled();
        });

        it.each([
            ["Brevo has its tag: sent, with Brevo's message id", "brevo-id-7", { status: "sent", brevoMessageId: "brevo-id-7" }],
            ["Brevo has no record of it: back in the queue", null, { status: "queued" }],
        ])("once Brevo has had time to record it — %s", async (_label, found, expected) => {
            await interrupted();
            const findSent = vi.fn(async () => found);

            await recoverInterruptedSends(deps({ now: at(5), findSent }));
            expect(findSent).not.toHaveBeenCalled(); // too soon to tell
            await recoverInterruptedSends(deps({ now: at(11), findSent }));

            expect(findSent).toHaveBeenCalledWith("letter-1");
            expect(await lettersCollection.findOne({ _id: 1 })).toMatchObject(expected);
        });

        it("waits while Brevo cannot be asked, and reports it once after an hour", async () => {
            const error = vi.spyOn(Logger, "error").mockResolvedValue(undefined);
            await interrupted();
            const findSent = vi.fn(async () => { throw new Error("Brevo events (502)"); });

            await recoverInterruptedSends(deps({ now: at(30), findSent }));
            expect(error).not.toHaveBeenCalled();
            await recoverInterruptedSends(deps({ now: at(65), findSent }));
            await recoverInterruptedSends(deps({ now: at(70), findSent }));

            expect(error).toHaveBeenCalledTimes(1);
            expect(await lettersCollection.findOne({ _id: 1 })).toMatchObject({ status: "sending" });
        });
    });

    it("holds letters in the outbox at the daily ceiling, and reports it", async () => {
        const error = vi.spyOn(Logger, "error").mockResolvedValue(undefined);
        for (let id = 1; id <= 7; id++) await finishedMeeting(id);
        const outbox = deps();

        await runOutbox(outbox);

        expect(outbox.send).toHaveBeenCalledTimes(5);
        expect(await lettersCollection.countDocuments({ status: "queued" })).toBe(2);
        expect(error).toHaveBeenCalledWith("letters", expect.stringMatching(/ceiling/));
        expect(await sendNextLetter(outbox)).toBe("ceiling");
    });

    it("counts only letters that reached their recipient: a test send uses up nobody", async () => {
        await finishedMeeting(1, { recipientId: "mp-anna" });
        await runOutbox(deps({ mode: "test" }));
        const collections = { meetings: meetingsCollection, letters: lettersCollection, blocklist: letterBlocklistCollection };

        const afterTest = await loadLetterHistory(collections, RECIPIENTS, { now: new Date(), excludeMeetingId: 99 });
        expect(afterTest.exclude.has("mp-anna")).toBe(false);

        await lettersCollection.updateOne({ _id: 1 }, { $set: { mode: "live" } });
        const afterLive = await loadLetterHistory(collections, RECIPIENTS, { now: new Date(), excludeMeetingId: 99 });
        expect(afterLive.exclude.has("mp-anna")).toBe(true);
    });
});
