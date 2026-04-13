import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getClientKey } from "@api/getClientKey.js";
import globalOptions from "@root/global-options.json" with { type: "json" };

vi.mock("@services/OpenAIService.js", () => ({
    getOpenAI: () => ({ apiKey: "test-openai-api-key" }),
}));

vi.mock("@utils/Logger.js", () => ({
    Logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
    },
}));

describe("getClientKey (forest / Swedish)", () => {
    beforeEach(() => {
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("POSTs transcription session with Swedish language and prompt from global options", async () => {
        vi.mocked(global.fetch).mockResolvedValue(
            new Response(JSON.stringify({ value: "ephemeral-secret" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const result = await getClientKey("sv");

        expect(result).toEqual({ value: "ephemeral-secret" });
        expect(global.fetch).toHaveBeenCalledTimes(1);

        const [, init] = vi.mocked(global.fetch).mock.calls[0];
        const body = JSON.parse((init as RequestInit).body as string);
        expect(body.session.type).toBe("transcription");
        expect(body.session.audio.input.transcription.language).toBe("sv");
        expect(body.session.audio.input.transcription.prompt).toBe(globalOptions.transcribePrompt.sv);
    });
});
