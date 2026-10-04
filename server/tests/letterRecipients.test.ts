import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";

import {
    candidateRecipients,
    CUSTOM_TOPIC_ID,
    loadRecipients,
    parseRecipientFiles,
    type Recipient,
} from "@logic/letters/recipients.js";

const TOPICS = ["forestry", "mining", CUSTOM_TOPIC_ID];

function entry(overrides: Partial<Recipient> = {}): Recipient {
    return {
        id: "skogsstyrelsen",
        name: "Skogsstyrelsen",
        kind: "institution",
        category: "agency",
        email: "registrator@example.org",
        language: "sv",
        remit: "Forestry Act",
        why: "you receive the felling notifications",
        topics: ["forestry"],
        active: true,
        facts: [],
        ...overrides,
    };
}

const file = (name: string, ...recipients: Partial<Recipient>[]) => ({
    name,
    content: { recipients: recipients.map((r) => entry(r)) },
});

describe("parseRecipientFiles", () => {
    it("combines every file into one list", () => {
        const all = parseRecipientFiles(
            [file("a.json", { id: "a" }), file("b.json", { id: "b", kind: "person" })],
            TOPICS,
        );
        expect(all.map((r) => r.id)).toEqual(["a", "b"]);
    });

    it.each([
        ["an id used twice across files", [file("a.json", { id: "x" }), file("b.json", { id: "x" })], /duplicates/],
        ["an active entry without an email", [file("a.json", { email: null })], /without an email/],
        ["an active entry without a why", [file("a.json", { why: " " })], /without a why/],
        ["an active entry without topics", [file("a.json", { topics: [] })], /without topics/],
        ["a topic the council never discusses", [file("a.json", { topics: ["fishing"] })], /unknown topic/],
        ["an address that is not an email", [file("a.json", { email: "registrator" })], /email/],
        ["a fact without a source", [file("a.json", { facts: [{ text: "voted yes", source: "", checked: "2026-10-04" }] })], /source/],
    ])("rejects %s", (_label, files, message) => {
        expect(() => parseRecipientFiles(files, TOPICS)).toThrow(message);
    });

    it("accepts an inactive entry left incomplete for curation", () => {
        expect(() => parseRecipientFiles([file("a.json", { active: false, email: null, why: null })], TOPICS)).not.toThrow();
    });
});

describe("loadRecipients", () => {
    it("means no letters, not an error, when the product has no list", async () => {
        const missing = path.join(os.tmpdir(), `no-letters-${Date.now()}`);
        await expect(loadRecipients(TOPICS, missing)).resolves.toEqual([]);
    });
});

describe("candidateRecipients", () => {
    const list = [
        entry({ id: "forest-a", topics: ["forestry"] }),
        entry({ id: "forest-b", topics: ["forestry", "mining"] }),
        entry({ id: "mine", topics: ["mining"] }),
        entry({ id: "asleep", topics: ["forestry"], active: false }),
    ];
    const ids = (recipients: Recipient[]) => recipients.map((r) => r.id).sort();

    it.each([
        ["a listed topic offers only recipients tagged with it", "forestry", undefined, ["forest-a", "forest-b"]],
        ["a visitor's own question offers everyone active", CUSTOM_TOPIC_ID, undefined, ["forest-a", "forest-b", "mine"]],
        ["an excluded recipient is never offered", "forestry", new Set(["forest-a"]), ["forest-b"]],
    ])("%s", (_label, topic, exclude, expected) => {
        expect(ids(candidateRecipients(list, topic, { max: 10, exclude }))).toEqual(expected);
    });

    it("caps the offer so a long list stays a choice", () => {
        expect(candidateRecipients(list, CUSTOM_TOPIC_ID, { max: 2 })).toHaveLength(2);
    });
});
