import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PanelistMessage } from "@shared/ModelTypes.js";

import { DirectedSpeakerRouter } from "@logic/DirectedSpeakerRouter.js";
import { Logger } from "@utils/Logger.js";
import { MockFactory } from "./factories/MockFactory.js";

describe("DirectedSpeakerRouter", () => {
    const meeting = MockFactory.createStoredMeeting();

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(Logger, "info").mockImplementation(() => undefined);
    });

    it("does nothing when directedSpeakerRouting is disabled", async () => {
        const router = new DirectedSpeakerRouter(MockFactory.createServerOptions({ directedSpeakerRouting: false }));
        router["nextSpeakerClassifier"].inferTarget = vi.fn().mockResolvedValue({
            rawOutput: "speaker2",
            targetId: "speaker2",
        });
        const message = MockFactory.createMessage({ speaker: "speaker1" });

        await router.annotateIfDirected(meeting, message, "speaker1");

        expect(router["nextSpeakerClassifier"].inferTarget).not.toHaveBeenCalled();
        expect(message.askParticular).toBeUndefined();
        expect(Logger.info).not.toHaveBeenCalled();
    });

    it("sets askParticular and logs a single routing line when classifier returns a different speaker", async () => {
        const router = new DirectedSpeakerRouter(MockFactory.createServerOptions({ directedSpeakerRouting: true }));
        router["nextSpeakerClassifier"].inferTarget = vi.fn().mockResolvedValue({
            rawOutput: "speaker2",
            targetId: "speaker2",
        });
        const message = MockFactory.createMessage({ speaker: "speaker1" });

        await router.annotateIfDirected(meeting, message, "speaker1");

        expect(message.askParticular).toBe("speaker2");
        expect(Logger.info).toHaveBeenCalledWith(
            `meeting ${meeting._id}`,
            '[directed-routing] after=speaker1 raw="speaker2" askParticular=speaker2'
        );
    });

    it("logs askParticular=(none) when classifier picks the same speaker", async () => {
        const router = new DirectedSpeakerRouter(MockFactory.createServerOptions({ directedSpeakerRouting: true }));
        router["nextSpeakerClassifier"].inferTarget = vi.fn().mockResolvedValue({
            rawOutput: "speaker1",
            targetId: "speaker1",
        });
        const message = MockFactory.createMessage({ speaker: "speaker1" });

        await router.annotateIfDirected(meeting, message, "speaker1");

        expect(message.askParticular).toBeUndefined();
        expect(Logger.info).toHaveBeenCalledWith(
            `meeting ${meeting._id}`,
            '[directed-routing] after=speaker1 raw="speaker1" askParticular=(none)'
        );
    });

    it("annotates panelist messages", async () => {
        const router = new DirectedSpeakerRouter(MockFactory.createServerOptions({ directedSpeakerRouting: true }));
        router["nextSpeakerClassifier"].inferTarget = vi.fn().mockResolvedValue({
            rawOutput: "speaker2",
            targetId: "speaker2",
        });
        const message: PanelistMessage = {
            id: "panelist0-1",
            type: "panelist",
            speaker: "panelist0",
            text: "Alice said: What do you think?",
        };

        await router.annotateIfDirected(meeting, message, "panelist0");

        expect(message.askParticular).toBe("speaker2");
    });
});
