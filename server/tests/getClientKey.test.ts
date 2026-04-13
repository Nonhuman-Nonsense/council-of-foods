import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getClientKey } from "@api/getClientKey.js";

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

describe("getClientKey", () => {
    beforeEach(() => {
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("POSTs to OpenAI client_secrets with Bearer from getOpenAI and session for the language", async () => {
        vi.mocked(global.fetch).mockResolvedValue(
            new Response(JSON.stringify({ value: "ephemeral-secret" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            })
        );

        const result = await getClientKey("en");

        expect(result).toEqual({ value: "ephemeral-secret" });
        expect(global.fetch).toHaveBeenCalledTimes(1);
        expect(global.fetch).toHaveBeenCalledWith(
            "https://api.openai.com/v1/realtime/client_secrets",
            expect.objectContaining({
                method: "POST",
                headers: expect.objectContaining({
                    Authorization: "Bearer test-openai-api-key",
                    "Content-Type": "application/json",
                }),
            })
        );

        const [, init] = vi.mocked(global.fetch).mock.calls[0];
        const body = JSON.parse((init as RequestInit).body as string);
        expect(body.session.type).toBe("transcription");
        expect(body.session.audio.input.transcription.language).toBe("en");
        expect(typeof body.session.audio.input.transcription.model).toBe("string");
        expect(body.session.audio.input.transcription.prompt).toBeDefined();
    });

    it("throws when OpenAI returns a non-OK response", async () => {
        vi.mocked(global.fetch).mockResolvedValue(
            new Response("rate limited", { status: 429, statusText: "Too Many Requests" })
        );

        await expect(getClientKey("en")).rejects.toThrow(/OpenAI client_secrets request failed \(429\)/);
    });
});
