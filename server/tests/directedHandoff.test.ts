import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PanelistMessage } from "@shared/ModelTypes.js";

import { annotateDirectedHandoff } from "@logic/directedHandoff.js";
import { SpeakerTargetClassifier } from "@logic/SpeakerTargetClassifier.js";
import { MockFactory } from "./factories/MockFactory.js";

describe("annotateDirectedHandoff", () => {
    const meeting = MockFactory.createStoredMeeting();
    let classifier: SpeakerTargetClassifier;

    beforeEach(() => {
        vi.restoreAllMocks();
        classifier = new SpeakerTargetClassifier(MockFactory.createServerOptions({ directedSpeakerRouting: true }));
    });

    it("does nothing when directedSpeakerRouting is disabled", async () => {
        classifier.inferTarget = vi.fn().mockResolvedValue("speaker2");
        const message = MockFactory.createMessage({ speaker: "speaker1" });

        await annotateDirectedHandoff(
            classifier,
            MockFactory.createServerOptions({ directedSpeakerRouting: false }),
            meeting,
            message
        );

        expect(classifier.inferTarget).not.toHaveBeenCalled();
        expect(message.askParticular).toBeUndefined();
    });

    it("does not annotate non-message types", async () => {
        classifier.inferTarget = vi.fn().mockResolvedValue("speaker2");
        const message = MockFactory.createMessage({ speaker: "speaker1", type: "invitation" });

        await annotateDirectedHandoff(
            classifier,
            MockFactory.createServerOptions({ directedSpeakerRouting: true }),
            meeting,
            message
        );

        expect(classifier.inferTarget).not.toHaveBeenCalled();
        expect(message.askParticular).toBeUndefined();
    });

    it("sets askParticular when the classifier returns a target", async () => {
        classifier.inferTarget = vi.fn().mockResolvedValue("speaker2");
        const message = MockFactory.createMessage({ speaker: "speaker1", text: "Speaker Two?" });

        await annotateDirectedHandoff(
            classifier,
            MockFactory.createServerOptions({ directedSpeakerRouting: true }),
            meeting,
            message
        );

        expect(classifier.inferTarget).toHaveBeenCalledWith(meeting, {
            mode: "participantHandoff",
            text: message.text,
            speakerId: "speaker1",
        });
        expect(message.askParticular).toBe("speaker2");
    });

    it("leaves askParticular unset when the classifier returns undefined", async () => {
        classifier.inferTarget = vi.fn().mockResolvedValue(undefined);
        const message = MockFactory.createMessage({ speaker: "speaker1" });

        await annotateDirectedHandoff(
            classifier,
            MockFactory.createServerOptions({ directedSpeakerRouting: true }),
            meeting,
            message
        );

        expect(message.askParticular).toBeUndefined();
    });

    it("annotates panelist messages", async () => {
        classifier.inferTarget = vi.fn().mockResolvedValue("speaker2");
        const message: PanelistMessage = {
            id: "panelist0-1",
            type: "panelist",
            speaker: "panelist0",
            text: "Alice said: What do you think?",
        };

        await annotateDirectedHandoff(
            classifier,
            MockFactory.createServerOptions({ directedSpeakerRouting: true }),
            meeting,
            message
        );

        expect(message.askParticular).toBe("speaker2");
    });
});
