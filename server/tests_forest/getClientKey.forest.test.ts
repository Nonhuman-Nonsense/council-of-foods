import { describe, it, expect } from "vitest";
import { getHumanInputRealtimeBootstrap } from "@api/realtimeProviders.js";
import globalOptions from "@root/global-options.json" with { type: "json" };

describe("getClientKey (forest / Swedish)", () => {
    it("builds Swedish human-input bootstrap with the forest prompt from global options", async () => {
        const result = await getHumanInputRealtimeBootstrap("sv");

        expect(result.provider).toBe("openai");
        expect(result.session).toMatchObject({
            type: "transcription",
            audio: {
                input: {
                    transcription: {
                        language: "sv",
                        prompt: globalOptions.transcribePrompt.sv,
                    },
                },
            },
        });
    });
});
