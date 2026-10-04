import { describe, expect, it } from "vitest";
import type { OutboxLetter } from "@models/DBModels.js";
import { checkOutboxLetter, letterReplyTo, letterSender } from "@logic/letters/outbox.js";

const options = {
    letterSiteUrl: "https://council-of-forest.com",
    letterSenderDomain: "council-of-forest.com",
    letterReplyDomain: "reply.council-of-forest.com",
    letterSenderAddresses: { treeharvester: "tree.harvester" },
    letterDailyLimit: 60,
};

describe("letter addresses", () => {
    it.each([
        ["a being by its id", "reindeer", "reindeer@council-of-forest.com", "reindeer.1400@reply.council-of-forest.com"],
        ["a being with its own address", "treeharvester", "tree.harvester@council-of-forest.com", "tree.harvester.1400@reply.council-of-forest.com"],
    ])("sends %s from its address, with replies coming back to the meeting", (_label, authorId, from, replyTo) => {
        expect(letterSender(options, authorId, "Renen")).toEqual({ name: "Renen", email: from });
        expect(letterReplyTo(options, authorId, 1400)).toBe(replyTo);
    });
});

describe("checkOutboxLetter", () => {
    const body = "Dear Skogsstyrelsen, I am a reindeer of Juhttátahkka and I write from Council of Forest.";
    const footer = "—\n\nThe meeting can be heard and read in full here: https://council-of-forest.com/sv/meeting/1400";
    const letter = (text: string, subject = "Three weeks"): OutboxLetter => ({
        _id: 1400, status: "queued", recipientId: "skogsstyrelsen", recipientKind: "institution", to: "registrator@example.org",
        from: { name: "Renen", email: "reindeer@council-of-forest.com" }, replyTo: "reindeer.1400@reply.council-of-forest.com",
        subject, text, queuedAt: new Date(),
    });

    it.each([
        ["a letter with its footer and the meeting's link", letter(`${body}\n\n${footer}`), null],
        ["no subject", letter(`${body}\n\n${footer}`, " "), /subject/],
        ["an empty letter", letter(`Hej\n\n${footer}`), /empty/],
        ["a letter far too long", letter(`${body.repeat(80)}\n\n${footer}`), /characters long/],
        ["someone else's email address", letter(`${body} Write to kalle.svensson@gmail.com.\n\n${footer}`), /kalle\.svensson@gmail\.com/],
        ["a link elsewhere", letter(`${body} See https://example.com/petition.\n\n${footer}`), /link/],
        ["our own reply address", letter(`${body} Answer me at reindeer.1400@reply.council-of-forest.com.\n\n${footer}`), null],
    ] as const)("%s", (_label, candidate, expected) => {
        const reason = checkOutboxLetter(candidate, options);
        if (expected === null) expect(reason).toBeNull();
        else expect(reason).toMatch(expected);
    });
});
