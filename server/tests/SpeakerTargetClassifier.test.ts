import { beforeEach, describe, expect, it, vi } from "vitest";

import { SpeakerTargetClassifier } from "@logic/SpeakerTargetClassifier.js";
import { CHAIR_ID } from "@logic/GlobalOptions.js";
import { Logger } from "@utils/Logger.js";
import { MockFactory } from "./factories/MockFactory.js";

describe("SpeakerTargetClassifier", () => {
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
        vi.spyOn(Logger, "info").mockImplementation(() => undefined);
        global.fetch = vi.fn();
    });

    it("returns undefined without calling the model when text is blank", async () => {
        const classifier = new SpeakerTargetClassifier(MockFactory.createServerOptions());

        await expect(classifier.inferTarget(meeting, { mode: "humanQuestion", text: "  " })).resolves.toBeUndefined();
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it("returns undefined when the model says anyone", async () => {
        global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            choices: [{ message: { content: "anyone" } }],
        }));
        const classifier = new SpeakerTargetClassifier(MockFactory.createServerOptions());

        await expect(
            classifier.inferTarget(meeting, { mode: "humanQuestion", text: "What should the council do next?" })
        ).resolves.toBeUndefined();
        expect(Logger.info).not.toHaveBeenCalled();
    });

    it("returns a normalized participant id and logs when a target is found", async () => {
        global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            choices: [{ message: { content: primarySpeaker.id } }],
        }));
        const classifier = new SpeakerTargetClassifier(MockFactory.createServerOptions());

        await expect(
            classifier.inferTarget(meeting, { mode: "humanQuestion", text: "Speaker One, what do you think?" })
        ).resolves.toBe(primarySpeaker.id);
        expect(Logger.info).toHaveBeenCalledWith(`meeting ${meeting._id}`, `directed to ${primarySpeaker.id}`);
    });

    it("returns undefined and warns when the Inworld request fails", async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
        const classifier = new SpeakerTargetClassifier(MockFactory.createServerOptions());

        await expect(
            classifier.inferTarget(meeting, { mode: "humanQuestion", text: "Speaker One?" })
        ).resolves.toBeUndefined();
        expect(Logger.warn).toHaveBeenCalled();
    });

    it("passes the full question text and a trimmed transcript window to the model", async () => {
        const longHumanText = `${"Speaker One should answer. ".repeat(120)}END`;
        const longMeeting = MockFactory.createStoredMeeting({
            ...meeting,
            conversation: Array.from({ length: 12 }, (_, index) =>
                MockFactory.createMessage({
                    speaker: index % 2 === 0 ? chair.id : primarySpeaker.id,
                    text: `Message ${index + 1}`,
                })
            ),
        });

        global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
            choices: [{ message: { content: primarySpeaker.id } }],
        }));
        const classifier = new SpeakerTargetClassifier(MockFactory.createServerOptions());

        await classifier.inferTarget(longMeeting, { mode: "humanQuestion", text: longHumanText });

        const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
        const userPrompt = body.messages[1].content as string;

        expect(userPrompt).toContain(longHumanText);
        expect(userPrompt).toContain(`${chair.name}: Message 3`);
        expect(userPrompt).toContain(`${primarySpeaker.name}: Message 12`);
        expect(userPrompt).not.toMatch(/: Message 1\n/);
        expect(userPrompt).not.toMatch(/: Message 2\n/);
        expect(userPrompt).toContain(formatExpectedAllowedTargetIds([chair.id, primarySpeaker.id, secondarySpeaker.id, "anyone"]));
        expect(userPrompt).toContain("Classify which meeting participant should directly answer the human question:");
    });

    describe("participantHandoff mode", () => {
        it("returns undefined when the target is the same participant who spoke", async () => {
            global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
                choices: [{ message: { content: primarySpeaker.id } }],
            }));
            const classifier = new SpeakerTargetClassifier(MockFactory.createServerOptions({ chairId: CHAIR_ID }));

            await expect(
                classifier.inferTarget(meeting, {
                    mode: "participantHandoff",
                    text: `${primarySpeaker.name} said: I think we should pause.`,
                    speakerId: primarySpeaker.id,
                })
            ).resolves.toBeUndefined();
            expect(Logger.info).not.toHaveBeenCalled();
        });

        it("excludes the chair from allowed target ids", async () => {
            global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
                choices: [{ message: { content: secondarySpeaker.id } }],
            }));
            const classifier = new SpeakerTargetClassifier(MockFactory.createServerOptions({ chairId: CHAIR_ID }));

            await classifier.inferTarget(meeting, {
                mode: "participantHandoff",
                text: `${primarySpeaker.name} said: Speaker Two?`,
                speakerId: primarySpeaker.id,
            });

            const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            const systemPrompt = body.messages[0].content as string;
            const userPrompt = body.messages[1].content as string;
            const expectedAllowedTargetIds = formatExpectedAllowedTargetIds([
                primarySpeaker.id,
                secondarySpeaker.id,
                "anyone",
            ]);

            expect(systemPrompt).toContain(expectedAllowedTargetIds);
            expect(userPrompt).toContain(expectedAllowedTargetIds);
            expect(userPrompt).not.toContain(`\n${chair.id}\n`);
            expect(userPrompt).toContain(
                "Classify which meeting participant should directly answer the latest council message:"
            );
        });

        it("includes the rendered latest message line", async () => {
            global.fetch = vi.fn().mockResolvedValue(mockJsonResponse({
                choices: [{ message: { content: secondarySpeaker.id } }],
            }));
            const classifier = new SpeakerTargetClassifier(MockFactory.createServerOptions({ chairId: CHAIR_ID }));

            await classifier.inferTarget(meeting, {
                mode: "participantHandoff",
                text: `${primarySpeaker.name} said: Speaker Two, what do you think?`,
                speakerId: primarySpeaker.id,
            });

            const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
            const userPrompt = body.messages[1].content as string;

            expect(userPrompt).toContain(
                `${primarySpeaker.name}: ${primarySpeaker.name} said: Speaker Two, what do you think?`
            );
        });
    });
});

function formatExpectedAllowedTargetIds(ids: string[]): string {
    return ["Allowed target ids:", ...ids].join("\n");
}

function mockJsonResponse(body: unknown): Response {
    return {
        ok: true,
        json: vi.fn().mockResolvedValue(body),
        text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    } as unknown as Response;
}
