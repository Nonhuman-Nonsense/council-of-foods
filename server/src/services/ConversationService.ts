import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { config } from "@root/src/config.js";
import { OUTBOUND_HTTP_TIMEOUT_MS } from "@utils/NetworkUtils.js";
import { parseChatCompletionUsage } from "@services/UsageService.js";
import type { UsageMeasures } from "@shared/UsageTypes.js";

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
    /**
     * Names a conversation that will be sent again soon with more on the end — a meeting's next
     * turn, a letter's draft after its plan — so its prompt is cached and read back cheaply
     * then. See {@link cacheRequestFields}. Leave it out for a one-off.
     */
    cacheKey?: string;
}

export interface ConversationCompletionResult {
    id: string | null;
    content: string | null;
    finishReason: string | null;
    /** Who served the completion and what it consumed, for the footprint meter. */
    usage?: {
        /** Who we called: "inworld" (router) or "openai". */
        provider: string;
        /** As requested, e.g. "mistral/mistral-large-3". */
        model: string;
        measures: UsageMeasures;
    };
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
                usage?: unknown;
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
            timeout: OUTBOUND_HTTP_TIMEOUT_MS,
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

/**
 * Asks the provider to cache the prompt. Each provider wants it differently, and without it the
 * whole conversation is billed at the full input price on every turn:
 *
 * - Mistral (and OpenAI) cache only requests that carry a `prompt_cache_key`. Probed through
 *   the Inworld router (October 2026): none of a repeated prompt cached without one, nearly
 *   all of it with one.
 * - Anthropic caches only up to a `cache_control` breakpoint. It goes on the last message
 *   before the final one, which is the one-off instruction or reply cue: the next request
 *   reads everything up to there from the cache, even when its own ending differs.
 *
 * Google models cache on their own; the extra field does them no harm.
 */
export function cacheRequestFields(
    model: string,
    messages: ChatCompletionMessageParam[],
    cacheKey: string | undefined,
): { messages: ChatCompletionMessageParam[]; prompt_cache_key?: string } {
    if (!cacheKey) return { messages };
    if (!model.startsWith("anthropic/") || messages.length < 2) return { messages, prompt_cache_key: cacheKey };

    // Our messages are plain strings; anything else is sent as it is.
    const index = messages.length - 2;
    const content = messages[index].content;
    if (typeof content !== "string" || content.length === 0) return { messages, prompt_cache_key: cacheKey };

    const marked = [...messages];
    // `cache_control` is Anthropic's, so the OpenAI types do not know it.
    marked[index] = {
        ...messages[index],
        content: [{ type: "text", text: content, cache_control: { type: "ephemeral" } }],
    } as unknown as ChatCompletionMessageParam;
    return { messages: marked, prompt_cache_key: cacheKey };
}

async function requestChatCompletion(
    client: ChatCompletionClient,
    params: ConversationCompletionParams,
    model: string,
    provider: ResolvedConversationModel["provider"],
): Promise<ConversationCompletionResult> {
    const requestParams: Parameters<ChatCompletionClient["chat"]["completions"]["create"]>[0] = {
        model,
        ...cacheRequestFields(model, params.messages, params.cacheKey),
        max_completion_tokens: params.maxCompletionTokens,
        temperature: params.temperature,
        stop: params.stop,
    };

    if (provider === "inworld" && params.reasoning !== "none") {
        requestParams.extra_body = buildInworldReasoningExtraBody(params.reasoning);
    } else if (params.reasoning !== "none") {
        requestParams.reasoning_effort = params.reasoning;
    }

    const completion = await client.chat.completions.create(requestParams);

    return {
        id: completion.id ?? null,
        content: completion.choices?.[0]?.message?.content ?? null,
        finishReason: completion.choices?.[0]?.finish_reason ?? "stop",
        usage: {
            provider: provider === "openai-direct" ? "openai" : provider,
            model,
            measures: parseChatCompletionUsage(completion.usage),
        },
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
