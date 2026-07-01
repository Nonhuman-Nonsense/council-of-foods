import { describe, expect, it } from "vitest";

import {
    buildConversationTranscript,
    CLASSIFIER_GENERAL_FLOW_KEYWORD,
    normalizeClassifierTargetId,
    parseClassifierOutput,
    resolveClassifierTarget,
} from "@logic/SpeakerClassifierBase.js";
import { MockFactory } from "./factories/MockFactory.js";

describe("SpeakerClassifierBase", () => {
    const chair = MockFactory.createChair();
    const alice = MockFactory.createCharacter({ id: "speaker1", name: "Speaker One" });
    const bob = MockFactory.createCharacter({ id: "speaker2", name: "Speaker Two" });
    const characters = [chair, alice, bob];
    const allowedTargetIds = [alice.id, bob.id, CLASSIFIER_GENERAL_FLOW_KEYWORD];

    describe("normalizeClassifierTargetId", () => {
        it("maps participant names to ids", () => {
            expect(normalizeClassifierTargetId(bob.name, characters)).toBe(bob.id);
        });

        it("returns undefined for anyone", () => {
            expect(normalizeClassifierTargetId(CLASSIFIER_GENERAL_FLOW_KEYWORD, characters)).toBeUndefined();
        });
    });

    describe("parseClassifierOutput", () => {
        it("accepts exact ids", () => {
            expect(parseClassifierOutput(alice.id, allowedTargetIds)).toBe(alice.id);
        });

        it("returns undefined for anyone", () => {
            expect(parseClassifierOutput(CLASSIFIER_GENERAL_FLOW_KEYWORD, allowedTargetIds)).toBeUndefined();
        });

        it("strips quotes and fences", () => {
            expect(parseClassifierOutput(`\`${bob.id}\``, allowedTargetIds)).toBe(bob.id);
        });

        it("extracts ids embedded in prose", () => {
            expect(parseClassifierOutput(`${alice.id} because sauces`, allowedTargetIds)).toBe(alice.id);
        });

        it("throws when no allowed id is present", () => {
            expect(() => parseClassifierOutput("unknown-speaker", allowedTargetIds)).toThrow(
                /did not return an allowed target id/
            );
        });
    });

    describe("resolveClassifierTarget", () => {
        it("returns undefined for empty model output", () => {
            expect(resolveClassifierTarget("", allowedTargetIds, characters)).toBeUndefined();
        });

        it("salvages a participant name when parse fails", () => {
            expect(resolveClassifierTarget(bob.name, allowedTargetIds, characters)).toBe(bob.id);
        });

        it("returns undefined for unknown output with no salvage match", () => {
            expect(resolveClassifierTarget("unknown-speaker", allowedTargetIds, characters)).toBeUndefined();
        });
    });

    describe("buildConversationTranscript", () => {
        it("includes only the last 10 speakable messages", () => {
            const meeting = MockFactory.createStoredMeeting({
                characters,
                conversation: [
                    ...Array.from({ length: 12 }, (_, index) =>
                        MockFactory.createMessage({
                            speaker: index % 2 === 0 ? chair.id : alice.id,
                            text: `Message ${index + 1}`,
                        })
                    ),
                    MockFactory.createMessage({ type: "awaiting_human_question", speaker: "Human", text: "waiting" }),
                ],
            });

            const transcript = buildConversationTranscript(meeting);

            expect(transcript).toHaveLength(10);
            expect(transcript[0]).toContain("Message 3");
            expect(transcript[9]).toContain("Message 12");
            expect(transcript.some((line) => line.endsWith("Message 1"))).toBe(false);
            expect(transcript.some((line) => line.endsWith("Message 2"))).toBe(false);
            expect(transcript.join("\n")).not.toContain("waiting");
        });
    });
});
