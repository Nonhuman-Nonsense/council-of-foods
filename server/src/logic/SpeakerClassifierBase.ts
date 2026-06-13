import type { Character, Message } from "@shared/ModelTypes.js";
import type { StoredMeeting } from "@models/DBModels.js";
import type { GlobalOptions } from "@logic/GlobalOptions.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { config } from "@root/src/config.js";
import { withNetworkRetry } from "@utils/NetworkUtils.js";

export const CLASSIFIER_GENERAL_FLOW_KEYWORD = "anyone";
export const CLASSIFIER_MAX_TOKENS = 20;
export const CLASSIFIER_TEMPERATURE = 0.1;
export const CLASSIFIER_TIMEOUT_MS = 4000;
export const CLASSIFIER_MAX_CONTEXT_MESSAGES = 10;

const INWORLD_CHAT_COMPLETIONS_URL = "https://api.inworld.ai/v1/chat/completions";

const SKIPPED_TRANSCRIPT_TYPES = new Set(["skipped", "awaiting_human_question", "awaiting_human_panelist"]);

interface RouterChatCompletionResponse {
    choices?: Array<{
        message?: {
            content?: string | null;
        };
    }>;
}

export function normalizeClassifierTargetId(
    targetId: string | undefined,
    characters: Character[]
): string | undefined {
    if (!targetId || targetId === CLASSIFIER_GENERAL_FLOW_KEYWORD) return undefined;

    const normalized = targetId.trim().toLowerCase();
    const match = characters.find(
        (character) =>
            character.id.toLowerCase() === normalized || character.name.toLowerCase() === normalized
    );
    return match?.id;
}

export function parseClassifierOutput(content: string, allowedTargetIds: string[]): string | undefined {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
        throw new Error("Speaker classifier returned empty text");
    }

    const normalized = trimmed.toLowerCase();
    const allowedTargets = allowedTargetIds.map((id) => id.toLowerCase());

    const exactCandidate = normalized.replace(/[`"'*]/g, "").trim();
    if (allowedTargets.includes(exactCandidate)) {
        return exactCandidate === CLASSIFIER_GENERAL_FLOW_KEYWORD ? undefined : exactCandidate;
    }

    for (const candidate of allowedTargets) {
        const pattern = new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if (pattern.test(normalized)) {
            return candidate === CLASSIFIER_GENERAL_FLOW_KEYWORD ? undefined : candidate;
        }
    }

    throw new Error(`Speaker classifier did not return an allowed target id: ${trimmed.slice(0, 160)}`);
}

export function resolveClassifierTarget(
    content: string,
    allowedTargetIds: string[],
    characters: Character[]
): string | undefined {
    const rawOutput = content.trim();
    if (rawOutput.length === 0) {
        return undefined;
    }

    try {
        const parsedTarget = parseClassifierOutput(content, allowedTargetIds);
        if (!parsedTarget) {
            return undefined;
        }
        return normalizeClassifierTargetId(parsedTarget, characters);
    } catch {
        return normalizeClassifierTargetId(rawOutput, characters);
    }
}

export async function requestSpeakerClassifierCompletion(
    serverOptions: GlobalOptions,
    messages: ChatCompletionMessageParam[],
    maxTokens: number,
    logLabel: string
): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

    try {
        const response = await withNetworkRetry(
            () =>
                fetch(INWORLD_CHAT_COMPLETIONS_URL, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${config.INWORLD_API_KEY}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        model: serverOptions.speakerClassifierModel,
                        temperature: CLASSIFIER_TEMPERATURE,
                        max_tokens: maxTokens,
                        messages,
                    }),
                    signal: controller.signal,
                }),
            logLabel
        );

        if (!response.ok) {
            const errText = await response.text().catch(() => "");
            throw new Error(`Inworld speaker classifier error: ${response.status} ${errText}`);
        }

        const data = (await response.json()) as RouterChatCompletionResponse;
        const content = data.choices?.[0]?.message?.content;
        return typeof content === "string" ? content : "";
    } finally {
        clearTimeout(timeout);
    }
}

export function renderConversationLine(message: Message, meeting: StoredMeeting): string {
    const speakerName =
        message.type === "human"
            ? meeting.state?.humanName || "Human"
            : meeting.characters.find((character) => character.id === message.speaker)?.name ||
              message.speaker;

    return `${speakerName}: ${message.text}`;
}

export function buildConversationTranscript(meeting: StoredMeeting): string[] {
    return meeting.conversation
        .flatMap((message) => {
            if (!("speaker" in message) || !("text" in message)) return [];
            if (SKIPPED_TRANSCRIPT_TYPES.has(message.type)) return [];
            return [renderConversationLine(message, meeting)];
        })
        .slice(-CLASSIFIER_MAX_CONTEXT_MESSAGES);
}
