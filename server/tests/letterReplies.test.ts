import { describe, expect, it } from "vitest";
import { isAutomaticReply, meetingOfReplyAddress, parseReplyKind, type InboundEmail } from "@logic/letters/replies.js";

describe("meetingOfReplyAddress", () => {
    it.each([
        ["reindeer.1400@reply.council-of-forest.com", 1400],
        ["Tree.Harvester.7@Reply.Council-of-Forest.com", 7],
        ["reindeer@reply.council-of-forest.com", null],
        ["reindeer.1400@council-of-forest.com", null],
        ["hello@nonhuman-nonsense.com", null],
    ])("reads %s as meeting %s", (address, expected) => {
        expect(meetingOfReplyAddress(address, "reply.council-of-forest.com")).toBe(expected);
    });
});

describe("isAutomaticReply", () => {
    const email = (overrides: Partial<InboundEmail>): InboundEmail => ({
        From: { Address: "registrator@skogsstyrelsen.se" }, Subject: "Re: Three weeks", Headers: {}, ...overrides,
    });

    it.each([
        ["an Auto-Submitted header", email({ Headers: { "Auto-Submitted": "auto-replied" } }), true],
        ["Auto-Submitted: no", email({ Headers: { "Auto-Submitted": "no" } }), false],
        ["an X-Autoreply header", email({ Headers: { "X-Autoreply": "yes" } }), true],
        ["headers posted as raw text", email({ Headers: "Received: x\nAuto-Submitted: auto-generated\n" }), true],
        ["an out-of-office subject", email({ Subject: "Out of Office: Re: Three weeks" }), true],
        ["a Swedish automatic subject", email({ Subject: "Automatiskt svar: Tre veckor" }), true],
        ["a mailer daemon", email({ From: { Address: "MAILER-DAEMON@mail.example.org" } }), true],
        ["a person's reply", email({}), false],
    ] as const)("%s → %s", (_label, candidate, expected) => {
        expect(isAutomaticReply(candidate)).toBe(expected);
    });
});

describe("parseReplyKind", () => {
    it.each([
        ["reply: they thank the reindeer", "reply"],
        ["**Opt-out**: they ask for no more letters", "opt-out"],
        ["automatic: an out-of-office message", "automatic"],
        ["not sure", "reply"],
    ])("reads %j", (raw, kind) => {
        expect(parseReplyKind(raw).kind).toBe(kind);
    });
});
