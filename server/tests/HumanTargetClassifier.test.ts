import { beforeEach, describe, expect, it, vi } from "vitest";

import { HumanTargetClassifier } from "@logic/HumanTargetClassifier.js";
import { Logger } from "@utils/Logger.js";
import { MockFactory } from "./factories/MockFactory.js";

describe("HumanTargetClassifier", () => {
    const meeting = MockFactory.createStoredMeeting({
        _id: 42,
        topic: MockFactory.createTopic({
            id: "topic-1",
            title: "Food futures",
            description: "A council about sustainable food systems",
            prompt: "Discuss sustainable food futures.",
        }),
        characters: [
            MockFactory.createCharacter({ id: "chair", name: "Chair" }),
            MockFactory.createCharacter({ id: "tomato", name: "Tomato", description: "Knows sauces" }),
            MockFactory.createCharacter({ id: "potato", name: "Potato", description: "Knows farming" }),
        ],
        conversation: [
            MockFactory.createMessage({ speaker: "chair", text: "Let's discuss sauces." }),
            MockFactory.createMessage({ speaker: "tomato", text: "I can help with flavor pairings." }),
        ],
    });

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(Logger, "warn").mockResolvedValue();
        vi.spyOn(Logger, "info").mockImplementation(() => undefined);
        global.fetch = vi.fn();
    });

    it("returns the validated participant id for confident matches", async () => {
        global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            choices: [{ message: { content: "tomato" } }]
        }));
        const classifier = new HumanTargetClassifier(MockFactory.createServerOptions());

        await expect(classifier.inferTarget(meeting, "Tomato, what do you think?")).resolves.toBe("tomato");
    });

    it("returns undefined when the model says anyone", async () => {
        global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            choices: [{ message: { content: "anyone" } }]
        }));
        const classifier = new HumanTargetClassifier(MockFactory.createServerOptions());

        await expect(classifier.inferTarget(meeting, "What should the council do next?")).resolves.toBeUndefined();
    });

    it("falls back when the returned id is not in the meeting", async () => {
        global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            choices: [{ message: { content: "unknown-food" } }]
        }));
        const classifier = new HumanTargetClassifier(MockFactory.createServerOptions());

        await expect(classifier.inferTarget(meeting, "Who knows the most about this?")).resolves.toBeUndefined();
    });

    it("falls back when the model returns no usable id", async () => {
        global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            choices: [{ message: { content: "" } }]
        }));
        const classifier = new HumanTargetClassifier(MockFactory.createServerOptions());

        await expect(classifier.inferTarget(meeting, "Potato?")).resolves.toBeUndefined();
    });

    it("salvages a target id from leading prose", async () => {
        global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            choices: [{ message: { content: "Here is tomato" } }]
        }));
        const classifier = new HumanTargetClassifier(MockFactory.createServerOptions());

        await expect(classifier.inferTarget(meeting, "Tomato, what do you think?")).resolves.toBe("tomato");
    });

    it("accepts quoted or fenced single-token output", async () => {
        global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            choices: [{ message: { content: "`potato`" } }]
        }));
        const classifier = new HumanTargetClassifier(MockFactory.createServerOptions());

        await expect(classifier.inferTarget(meeting, "Potato, how should this be grown?")).resolves.toBe("potato");
    });

    it("extracts an allowed id when extra text follows", async () => {
        global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            choices: [{ message: { content: "potato because this is about farming" } }]
        }));
        const classifier = new HumanTargetClassifier(MockFactory.createServerOptions());

        await expect(classifier.inferTarget(meeting, "Potato, what do you think?")).resolves.toBe("potato");
    });

    it("falls back when the Inworld request fails", async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
        const classifier = new HumanTargetClassifier(MockFactory.createServerOptions());

        await expect(classifier.inferTarget(meeting, "Tomato?")).resolves.toBeUndefined();
    });

    it("sends a readable transcript and limits context to the last 10 messages", async () => {
        const longMeeting = MockFactory.createStoredMeeting({
            ...meeting,
            conversation: Array.from({ length: 12 }, (_, index) =>
                MockFactory.createMessage({
                    speaker: index % 2 === 0 ? "chair" : "tomato",
                    text: `Message ${index + 1}`,
                })
            ),
        });

        global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            choices: [{ message: { content: "tomato" } }]
        }));
        const classifier = new HumanTargetClassifier(MockFactory.createServerOptions());

        await classifier.inferTarget(longMeeting, "Tomato, what do you think?");

        const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
        const requestInit = fetchMock.mock.calls[0][1];
        const body = JSON.parse(requestInit.body);
        const systemPrompt = body.messages[0].content;
        const prompt = body.messages[1].content;

        expect(systemPrompt).toContain("chair");
        expect(systemPrompt).toContain("tomato");
        expect(systemPrompt).toContain("anyone");
        expect(prompt).toContain("Participants:");
        expect(prompt).toContain("- id: tomato | name: Tomato | description: Knows sauces");
        expect(prompt).toContain("Recent conversation:");
        expect(prompt).toContain("Chair: Message 3");
        expect(prompt).toContain("Tomato: Message 12");
        expect(prompt).not.toContain("Chair: Message 1\n");
        expect(prompt).not.toContain("Tomato: Message 2\n");
        expect(prompt).toContain("Human question:");
        expect(prompt).toContain("Allowed target ids: chair, tomato, potato, anyone");
    });
});

function mockJsonResponse(body: unknown): Response {
    return {
        ok: true,
        json: vi.fn().mockResolvedValue(body),
        text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    } as unknown as Response;
}
