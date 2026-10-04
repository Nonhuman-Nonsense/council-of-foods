import { describe, expect, it } from "vitest";
import { LETTER_FORMS, LETTER_REACHES, RETHINK_ANGLES, letterPrompts, type DraftPromptParams, type PlanPromptParams } from "@logic/letters/prompts/letterPrompts.js";

/**
 * Not the wording — that changes with every round of evaluation — but that what the letter
 * writer passes in actually reaches the model in every language.
 */
const planParams: PlanPromptParams = { beingName: "Reindeer", recipientList: "x", humanName: null, reach: "step", angles: [], recentAsks: [] };
const draftParams: DraftPromptParams = {
    form: "requests", asksReply: false, authorId: "reindeer", beingName: "Reindeer", recipientName: "Sveaskog",
    recipientWhy: "", recipientFacts: [], points: [], meetingId: 1, date: "",
};

describe.each(["en", "sv"])("letter prompts (%s)", (language) => {
    const prompts = letterPrompts(language);

    it("names every candidate author", () => {
        const prompt = prompts.author({ candidates: [{ id: "reindeer", name: "Reindeer" }, { id: "pine", name: "Pine" }] });
        expect(prompt).toContain("reindeer");
        expect(prompt).toContain("pine");
    });

    it("gives the author the recipient list", () => {
        expect(prompts.plan({ ...planParams, recipientList: "sveaskog | Sveaskog | why" })).toContain("sveaskog | Sveaskog | why");
    });

    it("shows the author what the latest letters asked", () => {
        expect(prompts.plan({ ...planParams, recentAsks: ["File a motion to restore the six weeks."] })).toContain("File a motion to restore the six weeks.");
    });

    it("gives every reach its own instruction", () => {
        expect(new Set(LETTER_REACHES.map((reach) => prompts.plan({ ...planParams, reach }))).size).toBe(LETTER_REACHES.length);
    });

    it("gives every rethink angle its own instruction", () => {
        const plan = (angle: (typeof RETHINK_ANGLES)[number]) => prompts.plan({ ...planParams, reach: "rethink", angles: [angle] });
        expect(new Set(RETHINK_ANGLES.map(plan)).size).toBe(RETHINK_ANGLES.length);
    });

    it("gives the author the recipient, what is on record, the points and the meeting", () => {
        const prompt = prompts.draft({
            ...draftParams,
            form: "invitation",
            beingName: "Reindeer",
            recipientName: "Sveaskog",
            recipientWhy: "you hold the forest",
            recipientFacts: ["In 2024 you managed 37 hectares without clear-cutting."],
            points: ["stop the felling"],
            meetingId: 1400,
            date: "3 October 2026",
        });
        for (const expected of ["Sveaskog", "you hold the forest", "37 hectares", "stop the felling", "1400", "3 October 2026"]) {
            expect(prompt).toContain(expected);
        }
    });

    it("gives the rewrite the draft, the human's words and their name", () => {
        const prompt = prompts.weave({
            beingName: "Reindeer",
            recipientName: "Sveaskog",
            subject: "Fifty metres",
            body: "Please stop.",
            addition: "I swam here as a child.",
            humanName: "Frank",
            meetingId: 1400,
        });
        for (const expected of ["Fifty metres", "Please stop.", "I swam here as a child.", "Frank", "1400"]) {
            expect(prompt).toContain(expected);
        }
    });

    it("gives every letter form its own instruction", () => {
        const draft = (form: (typeof LETTER_FORMS)[number]) => prompts.draft({ ...draftParams, form });
        expect(new Set(LETTER_FORMS.map(draft)).size).toBe(LETTER_FORMS.length);
    });

    it("asks for a reply only in the letters chosen to", () => {
        expect(prompts.draft({ ...draftParams, asksReply: true })).not.toBe(prompts.draft(draftParams));
    });

    it("asks the human by name in the plan, when there is one", () => {
        expect(prompts.plan({ ...planParams, humanName: "Frank" })).toContain("Frank");
    });
});

describe.each(["en", "sv"])("a human's words set apart (%s)", (language) => {
    it("are quoted in full after the letter, with their first name when there is one", () => {
        const note = letterPrompts(language).humanApart("You are all corrupt idiots.", "Frank");
        expect(note).toContain("You are all corrupt idiots.");
        expect(note).toContain("Frank");
    });
});

describe("letterPrompts", () => {
    it("falls back to English for a language without prompts", () => {
        expect(letterPrompts("fi").author({ candidates: [] })).toBe(letterPrompts("en").author({ candidates: [] }));
    });
});
