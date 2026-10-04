import { describe, expect, it, vi } from "vitest";

import {
    LetterStepError,
    withoutContactDetails,
    parseAuthorRanking,
    parseLetterAnswer,
    parseHumanHandling,
    selectAuthor,
    selectLetterForm,
    humanFirstName,
    draftLetter,
    finishLetter,
    parsePlanAnswer,
    planLetter,
    type AuthorRanking,
    type LetterContext,
    type SortedAddition,
} from "@logic/letters/LetterWriter.js";
import type { Recipient } from "@logic/letters/recipients.js";
import { LETTER_FORMS } from "@logic/letters/prompts/letterPrompts.js";
import { MockFactory } from "./factories/MockFactory.js";

const chair = MockFactory.createChair();
const reindeer = MockFactory.createCharacter({ id: "reindeer", name: "Reindeer" });
const pine = MockFactory.createCharacter({ id: "pine", name: "Pine" });
const harvester = MockFactory.createCharacter({ id: "treeharvester", name: "Tree Harvester" });

const recipient = (id: string, overrides: Partial<Recipient> = {}): Recipient => ({
    id,
    name: id,
    kind: "institution",
    category: "agency",
    email: `${id}@example.org`,
    language: "sv",
    remit: "remit",
    why: "why",
    topics: ["forestry"],
    active: true,
    facts: [],
    ...overrides,
});

const offered = [recipient("skogsstyrelsen"), recipient("sveaskog")];

describe("parseAuthorRanking", () => {
    const members = [reindeer, pine, harvester];

    it("reads one candidate per line, best first, with ids, names and numbering", () => {
        const raw = "1. reindeer: its route was the cost\n2. **Tree Harvester** — it defended the felling\n3. Pine - it lost the vote";
        expect(parseAuthorRanking(raw, members)).toEqual([
            { authorId: "reindeer", reason: "its route was the cost" },
            { authorId: "treeharvester", reason: "it defended the felling" },
            { authorId: "pine", reason: "it lost the vote" },
        ]);
    });

    it("keeps the first mention of a candidate named twice, and skips lines naming nobody", () => {
        const raw = "Here is my ranking:\npine: first\nthe river, obviously\npine: again";
        expect(parseAuthorRanking(raw, members)).toEqual([{ authorId: "pine", reason: "first" }]);
    });
});

describe("selectAuthor", () => {
    const ranking: AuthorRanking = {
        ranking: ["reindeer", "pine", "treeharvester"].map((authorId) => ({ authorId, reason: `${authorId} reason` })),
        fallback: false,
        prompt: "",
        raw: "",
    };

    it.each([
        ["nobody wrote lately: the best-ranked", [], 3, "reindeer", []],
        ["the best-ranked wrote lately: the next", ["salmon", "reindeer"], 3, "pine", ["reindeer"]],
        ["a cooldown long passed counts for nothing", ["reindeer", "salmon", "lichen", "bumblebee"], 3, "reindeer", []],
        ["everyone wrote lately: the one who wrote longest ago", ["pine", "treeharvester", "reindeer"], 3, "pine", ["reindeer"]],
        ["no cooldown: always the best-ranked", ["reindeer"], 0, "reindeer", []],
    ])("%s", (_label, recent, cooldown, authorId, resting) => {
        const choice = selectAuthor(ranking, recent, cooldown);
        expect(choice.authorId).toBe(authorId);
        expect(choice.reason).toBe(`${authorId} reason`);
        expect(choice.restingAuthors).toEqual(resting);
    });
});

describe("parseHumanHandling", () => {
    it.each([
        ["weave: a wish the reindeer can carry", "weave", "a wish the reindeer can carry"],
        ["**Apart**: an insult aimed at the recipient", "apart", "an insult aimed at the recipient"],
        ["omit: only a phone number", "omit", "only a phone number"],
        ["decline: they said no, that's it", "decline", "they said no, that's it"],
        ["I am not sure what to do with this", "apart", ""],
    ])("reads %j", (raw, handling, reason) => {
        expect(parseHumanHandling(raw)).toEqual({ handling, reason });
    });
});

describe("parsePlanAnswer", () => {
    const json = `{"recipientId": "skogsstyrelsen", "points": ["a", "b"], "spokenText": "I will write."}`;

    it.each([
        ["a bare object", json],
        ["a fenced object", "```json\n" + json + "\n```"],
        ["an object with text around it", "Here is my plan:\n" + json + "\nThank you."],
        ["an id in another case", json.replace("skogsstyrelsen", "Skogsstyrelsen")],
        ["an answer that starts over after an incomplete object", `{"recipientId": "sveaskog", "points": ["x"]}\n\n\`\`\`json\n${json}\n\`\`\``],
        ["a key with a stray space", json.replace(`"spokenText"`, `" spokenText"`)],
    ])("reads %s", (_label, raw) => {
        expect(parsePlanAnswer(raw, offered)).toEqual({
            recipientId: "skogsstyrelsen",
            points: ["a", "b"],
            spokenText: "I will write.",
        });
    });

    it("reads braces and quotes inside the text as text", () => {
        const raw = `{"recipientId": "skogsstyrelsen", "points": ["count {all} of it", "say \\"no\\" }"], "spokenText": "I will write."}`;
        expect(parsePlanAnswer(raw, offered).points).toEqual(["count {all} of it", 'say "no" }']);
    });

    it.each([
        ["a recipient that was not offered", json.replace("skogsstyrelsen", "lkab"), /not on the list/],
        ["no JSON at all", "I would write to the forest agency.", /no JSON/],
        ["a plan without points", `{"recipientId": "sveaskog", "points": [], "spokenText": "x"}`, /points/],
    ])("refuses %s", (_label, raw, message) => {
        expect(() => parsePlanAnswer(raw, offered)).toThrow(message);
    });
});

describe("parseLetterAnswer", () => {
    it.each([
        ["an English subject line", "Subject: The fifty metres\n\nDear agency,\nPlease."],
        ["a Swedish subject line", "Ämne: The fifty metres\n\nDear agency,\nPlease."],
        ["a bold subject line", "**Subject:** The fifty metres\n\nDear agency,\nPlease."],
        ["a subject line after a separator", "---\nSubject: The fifty metres\n\nDear agency,\nPlease."],
    ])("splits %s from the body", (_label, raw) => {
        expect(parseLetterAnswer(raw)).toEqual({ subject: "The fifty metres", body: "Dear agency,\nPlease." });
    });

    it("keeps a letter without a subject line whole", () => {
        expect(parseLetterAnswer("Dear agency,\nPlease.")).toEqual({ subject: "", body: "Dear agency,\nPlease." });
    });
});

describe("withoutContactDetails", () => {
    it.each([
        ["an email address", "write to kalle.svensson@gmail.com now", "write to [removed] now"],
        ["a Swedish mobile number", "my number is 070-123 45 67. Call me.", "my number is [removed]. Call me."],
        ["an international number", "ring +46 70 123 45 67", "ring [removed]"],
    ])("removes %s", (_label, text, expected) => {
        expect(withoutContactDetails(text)).toBe(expected);
    });

    it.each([
        ["years and figures", "The vote in June 2026 was 308 to 21, and 1,744 species are harmed."],
        ["a meeting number", "As we said in meeting #1174."],
    ])("leaves %s alone", (_label, text) => {
        expect(withoutContactDetails(text)).toBe(text);
    });
});

function context(answers: string[], humanName = "Frank Larsson"): { ctx: LetterContext; generate: ReturnType<typeof vi.fn> } {
    const generate = vi.fn();
    for (const text of answers) generate.mockResolvedValueOnce({ text, finishReason: "stop" });
    const ctx = {
        meeting: MockFactory.createStoredMeeting({
            _id: 1400,
            characters: [chair, reindeer, pine],
            language: "en",
            state: { alreadyInvited: false, humanName },
        }),
        options: MockFactory.createServerOptions(),
        dialogGenerator: { generateInCharacter: generate },
    } as unknown as LetterContext;
    return { ctx, generate };
}

describe("planLetter", () => {
    const good = `{"recipientId": "sveaskog", "points": ["stop"], "spokenText": "I write to Sveaskog."}`;

    it("samples again when an answer is unusable, and keeps the first usable one", async () => {
        const { ctx, generate } = context(["not json", good]);
        const plan = await planLetter(ctx, "reindeer", offered);
        expect(plan.recipientId).toBe("sveaskog");
        expect(generate).toHaveBeenCalledTimes(2);
    });

    it("gives up with the last answer attached when nothing usable comes back", async () => {
        const { ctx } = context(["no", "still no", "never"]);
        await expect(planLetter(ctx, "reindeer", offered)).rejects.toMatchObject({
            name: "LetterStepError",
            raw: "never",
        });
    });

    it("refuses to plan when no recipient is available", async () => {
        const { ctx, generate } = context([good]);
        await expect(planLetter(ctx, "reindeer", [])).rejects.toBeInstanceOf(LetterStepError);
        expect(generate).not.toHaveBeenCalled();
    });

    it("shows the author what the latest letters asked, and only the latest", async () => {
        const { ctx, generate } = context([good]);
        const recentAsks = Array.from({ length: 40 }, (_, i) => `ask number ${i + 1}.`);
        await planLetter(ctx, "reindeer", offered, recentAsks);
        const sent = generate.mock.calls[0][2] as string;
        expect(sent).toContain("ask number 40.");
        expect(sent).not.toContain("ask number 1.");
    });
});

describe("humanFirstName", () => {
    it.each([
        ["a full name, as the first name only", "Frank Larsson", "Frank"],
        ["a single name", "Elin", "Elin"],
        ["no name", "", null],
        ["a placeholder for no name", "Visitor", null],
        ["a Swedish placeholder", "Besökare", null],
    ])("reads %s", (_label, humanName, expected) => {
        expect(humanFirstName(MockFactory.createStoredMeeting({ state: { alreadyInvited: false, humanName } }))).toBe(expected);
    });
});

describe("selectLetterForm", () => {
    const noRotation = () => 0;

    it("cycles through every form before one comes back", () => {
        const recent: string[] = [];
        for (let i = 0; i < LETTER_FORMS.length; i++) recent.push(selectLetterForm(recent));
        expect(new Set(recent).size).toBe(LETTER_FORMS.length);
    });

    it("takes the form used longest ago once all have been used", () => {
        const recent = [...LETTER_FORMS.slice(3), ...LETTER_FORMS.slice(0, 3)];
        expect(selectLetterForm(recent, noRotation)).toBe(LETTER_FORMS[3]);
    });
});

describe("draftLetter", () => {
    const answer = "Subject: Fifty metres\n\nDear Sveaskog,\nPlease stop.\n\nReindeer";

    it("returns the parsed draft for the author and recipient chosen", async () => {
        const { ctx } = context([answer]);
        const draft = await draftLetter(ctx, { authorId: "reindeer", recipient: recipient("sveaskog"), points: ["stop"], form: "requests", asksReply: false });
        expect(draft).toMatchObject({
            form: "requests",
            authorId: "reindeer",
            recipientId: "sveaskog",
            subject: "Fifty metres",
            body: "Dear Sveaskog,\nPlease stop.\n\nReindeer",
        });
    });

    it("gives the model the points and what is on record about the recipient", async () => {
        const facts = [{ text: "On 16 June 2026 you voted yes to MJU29.", source: "https://data.riksdagen.se/x", checked: "2026-10-04" }];
        const { ctx, generate } = context([answer]);
        await draftLetter(ctx, { authorId: "reindeer", recipient: recipient("sveaskog", { facts }), points: ["stop the felling"], form: "requests", asksReply: false });
        const sent = generate.mock.calls[0][2] as string;
        expect(sent).toContain("stop the felling");
        expect(sent).toContain("On 16 June 2026 you voted yes to MJU29.");
    });
});

describe("finishLetter", () => {
    const draft = {
        form: "appeal" as const,
        asksReply: false,
        authorId: "reindeer",
        recipientId: "sveaskog",
        subject: "Fifty metres",
        body: "Dear Sveaskog,\nPlease stop.\n\nReindeer",
        prompt: "",
        raw: "",
    };
    const woven = "Subject: Fifty metres\n\nDear Sveaskog,\nPlease stop. Frank, a human at the council, swam here as a child.\n\nReindeer";
    const sorted = (handling: SortedAddition["handling"], text: string): SortedAddition => ({ text, handling, reason: "", raw: "" });
    const words = "I swam in this river as a child.";

    it.each([
        ["woven in: rewritten in the author's voice, and sent", "weave", true, false, true],
        ["set apart: printed after the letter as theirs, no rewrite, and sent", "apart", false, true, true],
        ["left out: the draft as it is, and not sent", "omit", false, false, false],
        ["nothing added: the draft as it is, and not sent", "none", false, false, false],
    ] as const)("%s", async (_label, handling, rewritten, noted, sent) => {
        const { ctx, generate } = context([woven]);
        const letter = await finishLetter(ctx, draft, recipient("sveaskog"), sorted(handling, handling === "none" ? "" : words));

        expect(generate.mock.calls.length > 0).toBe(rewritten);
        expect(letter.body.includes("Frank")).toBe(rewritten);
        expect(letter.humanNote?.includes(words) ?? false).toBe(noted);
        expect(letter.humanContributed).toBe(sent);
    });

    it("gives the rewrite the draft, the human's words and their first name, but not the meeting", async () => {
        const { ctx, generate } = context([woven]);
        await finishLetter(ctx, draft, recipient("sveaskog"), sorted("weave", words));
        const [, meeting, instruction, , , options] = generate.mock.calls[0];
        expect(instruction).toContain("Please stop.");
        expect(instruction).toContain(words);
        expect(instruction).toContain("Frank");
        expect(instruction).not.toContain("Larsson");
        expect(options).toMatchObject({ withConversation: false });
        expect(meeting._id).toBe(1400);
    });

    it("sets the words apart when the rewrite comes back empty, rather than dropping the human", async () => {
        const { ctx } = context(["   "]);
        const letter = await finishLetter(ctx, draft, recipient("sveaskog"), sorted("weave", words));
        expect(letter.body).toBe(draft.body);
        expect(letter.humanNote).toContain(words);
        expect(letter.human.handling).toBe("apart");
        expect(letter.humanContributed).toBe(true);
    });

    it("links the meeting in the footer, and says so there when a human's words are part of it", async () => {
        const withHuman = await finishLetter(context([woven]).ctx, draft, recipient("sveaskog"), sorted("weave", words));
        const without = await finishLetter(context([]).ctx, draft, recipient("sveaskog"), sorted("none", ""));
        for (const footer of [withHuman.footer, without.footer]) {
            expect(footer).toContain("https://example.org/en/meeting/1400");
            expect(footer).toContain("Reindeer");
        }
        expect(withHuman.footer).not.toBe(without.footer);
    });
});
