import { describe, expect, it } from "vitest";
import { letterHistory } from "@logic/letters/history.js";
import type { MeetingLetter } from "@models/DBModels.js";
import type { Recipient } from "@logic/letters/recipients.js";

const recipient = (id: string, kind: Recipient["kind"]): Recipient => ({
    id, name: id, kind, category: kind === "person" ? "parliament" : "agency", email: `${id}@example.org`,
    language: "sv", remit: "", why: "", topics: ["forestry"], active: true, facts: [],
});
const recipients = [recipient("mp-anna", "person"), recipient("skogsstyrelsen", "institution")];
const now = new Date("2026-10-10T12:00:00Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

describe("letterHistory", () => {
    it("lists recent authors, forms and asks oldest first", () => {
        const newestFirst: MeetingLetter[] = [
            { authorId: "pine", form: "note", points: ["c"] },
            { authorId: "reindeer", form: "appeal", points: ["a", "b"] },
        ];
        const history = letterHistory(newestFirst, [], [], recipients, now);
        expect(history.recentAuthors).toEqual(["reindeer", "pine"]);
        expect(history.recentForms).toEqual(["appeal", "note"]);
        expect(history.recentAsks).toEqual(["a", "b", "c"]);
    });

    it.each([
        ["a person who received a letter, however long ago", "mp-anna", hoursAgo(24 * 60), true],
        ["an institution that received one today", "skogsstyrelsen", hoursAgo(3), true],
        ["an institution whose last letter is more than a day old", "skogsstyrelsen", hoursAgo(25), false],
    ])("decides whether to exclude %s", (_label, recipientId, sentAt, excluded) => {
        const history = letterHistory([], [{ recipientId, sentAt: new Date(sentAt) }], [], recipients, now);
        expect(history.exclude.has(recipientId)).toBe(excluded);
    });

    it("excludes whoever is on the blocklist, letter or not", () => {
        expect(letterHistory([], [], ["skogsstyrelsen"], recipients, now).exclude.has("skogsstyrelsen")).toBe(true);
    });
});
