import { beforeEach, describe, expect, it, vi } from "vitest";

import { NextSpeakerClassifier } from "@logic/NextSpeakerClassifier.js";
import { CHAIR_ID } from "@logic/GlobalOptions.js";
import { Logger } from "@utils/Logger.js";
import { MockFactory } from "./factories/MockFactory.js";

describe("NextSpeakerClassifier", () => {
    const chair = MockFactory.createChair();
    const primarySpeaker = MockFactory.createCharacter({
        id: "speaker1",
        name: "Speaker One",
        description: "Knows sauces",
    });
    const secondarySpeaker = MockFactory.createCharacter({
        id: "speaker2",
        name: "Speaker Two",
        description: "Knows farming",
    });
    const meeting = MockFactory.createStoredMeeting({
        _id: 42,
        topic: MockFactory.createTopic({
            id: "topic-1",
            title: "Food futures",
            description: "A council about sustainable food systems",
            prompt: "Discuss sustainable food futures.",
        }),
        characters: [chair, primarySpeaker, secondarySpeaker],
        conversation: [
            MockFactory.createMessage({ speaker: chair.id, text: "Let's discuss sauces." }),
            MockFactory.createMessage({ speaker: primarySpeaker.id, text: "I can help with flavor pairings." }),
        ],
    });

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(Logger, "warn").mockResolvedValue();
        global.fetch = vi.fn();
    });

    it("returns the validated participant id for confident matches", async () => {
        global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            choices: [{ message: { content: secondarySpeaker.id } }],
        }));
        const classifier = new NextSpeakerClassifier(MockFactory.createServerOptions({ chairId: CHAIR_ID }));
        const latestMessage = MockFactory.createMessage({
            speaker: primarySpeaker.id,
            text: `${primarySpeaker.name} said: Speaker Two, what do you think?`,
        });

        await expect(classifier.inferTarget(meeting, latestMessage)).resolves.toEqual({
            rawOutput: secondarySpeaker.id,
            targetId: secondarySpeaker.id,
        });
    });

    it("returns raw output without target when the model says anyone", async () => {
        global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            choices: [{ message: { content: "anyone" } }],
        }));
        const classifier = new NextSpeakerClassifier(MockFactory.createServerOptions({ chairId: CHAIR_ID }));
        const latestMessage = MockFactory.createMessage({
            speaker: primarySpeaker.id,
            text: `${primarySpeaker.name} said: This affects everyone.`,
        });

        await expect(classifier.inferTarget(meeting, latestMessage)).resolves.toEqual({
            rawOutput: "anyone",
        });
    });

    it("excludes the chair from allowed target ids in the prompt", async () => {
        global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            choices: [{ message: { content: secondarySpeaker.id } }],
        }));
        const classifier = new NextSpeakerClassifier(MockFactory.createServerOptions({ chairId: CHAIR_ID }));
        const latestMessage = MockFactory.createMessage({
            speaker: primarySpeaker.id,
            text: `${primarySpeaker.name} said: Speaker Two?`,
        });

        await classifier.inferTarget(meeting, latestMessage);

        const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
        const body = JSON.parse(fetchMock.mock.calls[0][1].body);
        const systemPrompt = body.messages[0].content;
        const prompt = body.messages[1].content;

        expect(systemPrompt).toContain("addressee detection");
        expect(systemPrompt).toContain("only mentions someone by name at the start");
        expect(systemPrompt).toContain("asks that participant a direct question");
        expect(prompt).toContain("Chair (may be mentioned, but is NOT an eligible target):");
        expect(prompt).toContain(`name: ${chair.name}`);
        expect(prompt).not.toContain("Turn counts");
        expect(prompt).toContain(
            `Allowed target ids (return one of these, or "anyone" only): ${primarySpeaker.id}, ${secondarySpeaker.id}, anyone`
        );
        expect(prompt).not.toContain(`${chair.id}, anyone`);
    });

    it("falls back when the Inworld request fails", async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
        const classifier = new NextSpeakerClassifier(MockFactory.createServerOptions({ chairId: CHAIR_ID }));
        const latestMessage = MockFactory.createMessage({
            speaker: primarySpeaker.id,
            text: `${primarySpeaker.name} said: Speaker Two?`,
        });

        await expect(classifier.inferTarget(meeting, latestMessage)).resolves.toEqual({
            rawOutput: "(error)",
        });
    });
});

function mockJsonResponse(body: unknown): Response {
    return {
        ok: true,
        json: vi.fn().mockResolvedValue(body),
        text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    } as unknown as Response;
}
