import { describe, expect, it } from "vitest";
import type { Message } from "@shared/ModelTypes.js";
import type { StoredMeeting } from "@models/DBModels.js";
import { turnForModel } from "@logic/turnForModel.js";

function meeting(humanName: string): StoredMeeting {
    return {
        state: { humanName },
        characters: [
            { id: "river", name: "River" },
            { id: "pine", name: "Pine" },
            { id: "panelist0", name: "Alice" },
        ],
    } as unknown as StoredMeeting;
}

// The stored text of a human turn, as HumanInputHandler writes it.
const NBSP = "\u00a0";

describe("turnForModel", () => {
    it.each<[string, string, Message, string]>([
        ["a being", "Leo", { id: "1", type: "message", speaker: "pine", text: "Let it grow old." }, "Pine: Let it grow old."],
        ["the chair", "Leo", { id: "2", type: "message", speaker: "river", text: "Pine, what do you see?" }, "River: Pine, what do you see?"],
        ["a being answering a human", "Leo", { id: "3", type: "response", speaker: "pine", text: "Slowly." }, "Pine: Slowly."],
        ["a human, English", "Leo", { id: "4", type: "human", speaker: "Leo", text: `Leo said:${NBSP}Why cut it?` }, "Leo: Why cut it?"],
        ["a human, Swedish", "Leo", { id: "5", type: "human", speaker: "Leo", text: `Leo sa:${NBSP}Varför hugga?` }, "Leo: Varför hugga?"],
        ["a human with no name set", "", { id: "6", type: "human", speaker: "Human", text: `Human said:${NBSP}Hello?` }, "Human: Hello?"],
        ["a human whose words contain 'said:'", "Leo", { id: "7", type: "human", speaker: "Leo", text: `Leo said:${NBSP}My mum said: no.` }, "Leo: My mum said: no."],
        ["a human panelist, English", "Leo", { id: "8", type: "panelist", speaker: "panelist0", text: `Alice said:${NBSP}I agree.` }, "Alice: I agree."],
        ["a human panelist, Swedish", "Leo", { id: "9", type: "panelist", speaker: "panelist0", text: `Alice sa:${NBSP}Jag håller med.` }, "Alice: Jag håller med."],
    ])("%s", (_case, humanName, message, expected) => {
        expect(turnForModel(message, meeting(humanName))).toBe(expected);
    });
});
