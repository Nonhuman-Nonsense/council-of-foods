import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { config } from "@root/src/config.js";

const INWORLD_BASE_URL = "https://api.inworld.ai/v1";
const OPENAI_DIRECT_PREFIX = "openai-direct/";
type ConversationReasoning = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface ConversationCompletionParams {
    model: string;
    messages: ChatCompletionMessageParam[];
    maxCompletionTokens: number;
    temperature: number;
    stop?: string[];
    reasoning: ConversationReasoning;
}

export interface ConversationCompletionResult {
    id: string | null;
    content: string | null;
    finishReason: string | null;
}

export interface ConversationService {
    createChatCompletion(params: ConversationCompletionParams): Promise<ConversationCompletionResult>;
}

interface ChatCompletionClient {
    chat: {
        completions: {
            create: (params: {
                model: string;
                messages: ChatCompletionMessageParam[];
                max_completion_tokens: number;
                temperature: number;
                stop?: string[];
                reasoning_effort?: ConversationReasoning;
                extra_body?: {
                    reasoning: {
                        effort: ConversationReasoning;
                        max_tokens?: number;
                        exclude?: boolean;
                    };
                };
            }) => Promise<{
                id?: string | null;
                choices?: Array<{
                    message?: {
                        content?: string | null;
                    };
                    finish_reason?: string | null;
                }>;
            }>;
        };
    };
}

export interface ResolvedConversationModel {
    provider: "inworld" | "openai-direct";
    model: string;
}

let inworldClient: OpenAI | undefined;

function getInworldClient(): OpenAI {
    if (!inworldClient) {
        inworldClient = new OpenAI({
            baseURL: INWORLD_BASE_URL,
            apiKey: config.INWORLD_API_KEY,
            maxRetries: 3,
            timeout: 30 * 1000,
        });
    }

    return inworldClient;
}

function normalizeMessagesForInworldRouting(messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
    if (messages.some((message) => message.role !== "system")) {
        return messages;
    }

    if (messages.length === 0) {
        return [{ role: "user", content: "Continue the conversation." }];
    }

    const normalizedMessages = [...messages];
    const lastMessage = normalizedMessages[normalizedMessages.length - 1];
    const userContent = typeof lastMessage.content === "string"
        ? lastMessage.content
        : "Continue the conversation.";
    normalizedMessages[normalizedMessages.length - 1] = {
        role: "user",
        content: userContent,
    };

    return normalizedMessages;
}

export function resolveConversationModel(model: string): ResolvedConversationModel {
    if (model.startsWith(OPENAI_DIRECT_PREFIX)) {
        return {
            provider: "openai-direct",
            model: model.slice(OPENAI_DIRECT_PREFIX.length),
        };
    }

    return {
        provider: "inworld",
        model,
    };
}

export function buildInworldReasoningExtraBody(reasoning: ConversationReasoning): {
    reasoning: {
        effort: ConversationReasoning;
        max_tokens?: number;
        exclude?: boolean;
    };
} {
    if (reasoning === "none") {
        return {
            reasoning: {
                effort: "none",
                max_tokens: 0,
                exclude: true,
            },
        };
    }

    return {
        reasoning: {
            effort: reasoning,
        },
    };
}

async function requestChatCompletion(
    client: ChatCompletionClient,
    params: ConversationCompletionParams,
    model: string,
    provider: ResolvedConversationModel["provider"],
): Promise<ConversationCompletionResult> {
    const requestParams: Parameters<ChatCompletionClient["chat"]["completions"]["create"]>[0] = {
        model,
        messages: params.messages,
        max_completion_tokens: params.maxCompletionTokens,
        temperature: params.temperature,
        stop: params.stop,
    };

    if (provider === "inworld") {
        requestParams.extra_body = buildInworldReasoningExtraBody(params.reasoning);
    } else if (params.reasoning !== "none") {
        requestParams.reasoning_effort = params.reasoning;
    }

    const completion = await client.chat.completions.create(requestParams);

    return {
        id: completion.id ?? null,
        content: completion.choices?.[0]?.message?.content ?? null,
        finishReason: completion.choices?.[0]?.finish_reason ?? "stop",
    };
}

export function createConversationService(
    getOpenAI: () => OpenAI,
    getInworld: () => ChatCompletionClient = getInworldClient,
): ConversationService {
    return {
        async createChatCompletion(params: ConversationCompletionParams): Promise<ConversationCompletionResult> {
            const resolvedModel = resolveConversationModel(params.model);

            if (resolvedModel.provider === "openai-direct") {
                return requestChatCompletion(getOpenAI(), params, resolvedModel.model, resolvedModel.provider);
            }

            return requestChatCompletion(getInworld(), {
                ...params,
                messages: normalizeMessagesForInworldRouting(params.messages),
            }, resolvedModel.model, resolvedModel.provider);
        }
    };
}
