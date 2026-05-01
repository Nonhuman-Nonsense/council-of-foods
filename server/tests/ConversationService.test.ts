import { describe, expect, it, vi } from "vitest";

import {
    createConversationService,
    resolveConversationModel,
    type ConversationCompletionParams,
} from "@services/ConversationService.js";

function createMockClient(response: {
    id?: string;
    content?: string | null;
    finishReason?: string | null;
} = {}) {
    const create = vi.fn().mockResolvedValue({
        id: response.id ?? "mock-id",
        choices: [
            {
                message: { content: response.content ?? "mock-content" },
                finish_reason: response.finishReason ?? "stop",
            },
        ],
    });

    return {
        client: {
            chat: {
                completions: {
                    create,
                },
            },
        },
        create,
    };
}

function createParams(model: string): ConversationCompletionParams {
    return {
        model,
        messages: [{ role: "user", content: "Hello there" }],
        maxCompletionTokens: 123,
        temperature: 0.7,
        reasoning: "none",
        stop: ["\n---"],
    };
}

describe("ConversationService", () => {
    it("routes openai-direct models to the direct OpenAI client and strips the prefix", async () => {
        const direct = createMockClient({ id: "direct-id", content: "direct-response" });
        const inworld = createMockClient({ id: "inworld-id", content: "inworld-response" });

        const service = createConversationService(
            () => direct.client as never,
            () => inworld.client,
        );

        const result = await service.createChatCompletion(createParams("openai-direct/gpt-5.2"));

        expect(result).toEqual({
            id: "direct-id",
            content: "direct-response",
            finishReason: "stop",
        });
        expect(direct.create).toHaveBeenCalledWith(expect.objectContaining({
            model: "gpt-5.2",
            messages: [{ role: "user", content: "Hello there" }],
            max_completion_tokens: 123,
            temperature: 0.7,
            stop: ["\n---"],
        }));
        expect(inworld.create).not.toHaveBeenCalled();
    });

    it("routes provider/model ids through the Inworld client unchanged", async () => {
        const direct = createMockClient({ content: "direct-response" });
        const inworld = createMockClient({ id: "inworld-id", content: "inworld-response" });

        const service = createConversationService(
            () => direct.client as never,
            () => inworld.client,
        );

        const result = await service.createChatCompletion(createParams("anthropic/claude-opus-4-6"));

        expect(result).toEqual({
            id: "inworld-id",
            content: "inworld-response",
            finishReason: "stop",
        });
        expect(inworld.create).toHaveBeenCalledWith(expect.objectContaining({
            model: "anthropic/claude-opus-4-6",
            messages: [{ role: "user", content: "Hello there" }],
            max_completion_tokens: 123,
            temperature: 0.7,
            stop: ["\n---"],
            extra_body: {
                reasoning: {
                    effort: "none",
                    max_tokens: 0,
                    exclude: true,
                },
            },
        }));
        expect(direct.create).not.toHaveBeenCalled();
    });

    it("converts an all-system first-turn stack into a valid routed request", async () => {
        const direct = createMockClient({ content: "direct-response" });
        const inworld = createMockClient({ id: "inworld-id", content: "inworld-response" });

        const service = createConversationService(
            () => direct.client as never,
            () => inworld.client,
        );

        await service.createChatCompletion({
            model: "anthropic/claude-opus-4-6",
            messages: [
                { role: "system", content: "You are Water in the council." },
                { role: "system", content: "Water: " },
            ],
            maxCompletionTokens: 123,
            temperature: 0.7,
            reasoning: "none",
            stop: ["\n---"],
        });

        expect(inworld.create).toHaveBeenCalledWith(expect.objectContaining({
            messages: [
                { role: "system", content: "You are Water in the council." },
                { role: "user", content: "Water: " },
            ],
            extra_body: {
                reasoning: {
                    effort: "none",
                    max_tokens: 0,
                    exclude: true,
                },
            },
        }));
        expect(direct.create).not.toHaveBeenCalled();
    });

    it("passes non-none reasoning to direct OpenAI models via reasoning_effort", async () => {
        const direct = createMockClient({ id: "direct-id", content: "direct-response" });
        const inworld = createMockClient({ id: "inworld-id", content: "inworld-response" });

        const service = createConversationService(
            () => direct.client as never,
            () => inworld.client,
        );

        await service.createChatCompletion({
            ...createParams("openai-direct/gpt-5.2"),
            reasoning: "low",
        });

        expect(direct.create).toHaveBeenCalledWith(expect.objectContaining({
            model: "gpt-5.2",
            reasoning_effort: "low",
        }));
        expect(inworld.create).not.toHaveBeenCalled();
    });

    it("passes non-none reasoning to Inworld via extra_body", async () => {
        const direct = createMockClient({ content: "direct-response" });
        const inworld = createMockClient({ id: "inworld-id", content: "inworld-response" });

        const service = createConversationService(
            () => direct.client as never,
            () => inworld.client,
        );

        await service.createChatCompletion({
            ...createParams("mistral/mistral-small-3-2"),
            reasoning: "low",
        });

        expect(inworld.create).toHaveBeenCalledWith(expect.objectContaining({
            model: "mistral/mistral-small-3-2",
            extra_body: {
                reasoning: {
                    effort: "low",
                },
            },
        }));
        expect(direct.create).not.toHaveBeenCalled();
    });

    it("defaults the finish reason to stop when the provider omits it", async () => {
        const direct = {
            client: {
                chat: {
                    completions: {
                        create: vi.fn().mockResolvedValue({
                            id: "direct-id",
                            choices: [{ message: { content: "direct-response" } }],
                        }),
                    },
                },
            },
        };

        const service = createConversationService(
            () => direct.client as never,
            () => createMockClient().client,
        );

        const result = await service.createChatCompletion(createParams("openai-direct/gpt-4o-mini"));

        expect(result.finishReason).toBe("stop");
    });

    it("classifies openai-direct models via the resolver", () => {
        expect(resolveConversationModel("openai-direct/gpt-5.2")).toEqual({
            provider: "openai-direct",
            model: "gpt-5.2",
        });
    });

    it("classifies regular provider/model ids as Inworld-routed", () => {
        expect(resolveConversationModel("mistral/mistral-small-3-2")).toEqual({
            provider: "inworld",
            model: "mistral/mistral-small-3-2",
        });
    });
});
