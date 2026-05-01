import type { Character, Message } from "@shared/ModelTypes.js";
import type { StoredMeeting } from "@models/DBModels.js";
import type { GlobalOptions } from "@logic/GlobalOptions.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { config } from "@root/src/config.js";
import { Logger } from "@utils/Logger.js";
import { withNetworkRetry } from "@utils/NetworkUtils.js";

const INWORLD_CHAT_COMPLETIONS_URL = "https://api.inworld.ai/v1/chat/completions";
const HUMAN_TARGETING_GENERAL_FLOW_KEYWORD = "anyone";
const HUMAN_TARGETING_MAX_TOKENS = 20;
const HUMAN_TARGETING_TEMPERATURE = 0.1;
const HUMAN_TARGETING_TIMEOUT_MS = 4000;
const HUMAN_TARGETING_MAX_CONTEXT_MESSAGES = 10;

interface RouterChatCompletionResponse {
    choices?: Array<{
        message?: {
            content?: string | null;
        };
    }>;
}

export class HumanTargetClassifier {
    private serverOptions: GlobalOptions;

    constructor(serverOptions: GlobalOptions) {
        this.serverOptions = serverOptions;
    }

    async inferTarget(meeting: StoredMeeting, humanText: string): Promise<string | undefined> {
        if (humanText.trim().length === 0) return undefined;

        try {
            const rawTarget = await this.classifyTarget(meeting, humanText);
            if (!rawTarget) return undefined;

            const normalizedTargetId = this.normalizeTargetId(rawTarget, meeting.characters);
            if (!normalizedTargetId) {
                Logger.warn(
                    `meeting ${meeting._id}`,
                    `Human target classifier returned invalid target "${rawTarget}", falling back to normal flow.`
                );
                return undefined;
            }

            return normalizedTargetId;
        } catch (error) {
            Logger.warn(`meeting ${meeting._id}`, "Human target classifier failed, falling back to normal flow.", error as Error);
            return undefined;
        }
    }

    normalizeTargetId(targetId: string | undefined, characters: Character[]): string | undefined {
        if (!targetId || targetId === HUMAN_TARGETING_GENERAL_FLOW_KEYWORD) return undefined;

        const normalized = targetId.trim().toLowerCase();
        const match = characters.find((character) =>
            character.id.toLowerCase() === normalized || character.name.toLowerCase() === normalized
        );
        return match?.id;
    }

    private async classifyTarget(meeting: StoredMeeting, humanText: string): Promise<string | undefined> {
        const content = await this.requestCompletion(
            this.buildMessages(meeting, humanText),
            HUMAN_TARGETING_MAX_TOKENS
        );
        return this.parseOutput(content, meeting.characters);
    }

    private async requestCompletion(messages: ChatCompletionMessageParam[], maxTokens: number): Promise<string> {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), HUMAN_TARGETING_TIMEOUT_MS);

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
                            model: this.serverOptions.humanTargetingModel,
                            temperature: HUMAN_TARGETING_TEMPERATURE,
                            max_tokens: maxTokens,
                            messages,
                        }),
                        signal: controller.signal,
                    }),
                "HumanTargetClassifier"
            );

            if (!response.ok) {
                const errText = await response.text().catch(() => "");
                throw new Error(`Inworld human targeting error: ${response.status} ${errText}`);
            }

            const data = (await response.json()) as RouterChatCompletionResponse;
            const content = data.choices?.[0]?.message?.content;
            if (typeof content !== "string" || content.trim().length === 0) {
                throw new Error("Inworld human targeting returned empty content");
            }

            return content;
        } finally {
            clearTimeout(timeout);
        }
    }

    private buildMessages(meeting: StoredMeeting, humanText: string): ChatCompletionMessageParam[] {
        const conversationTranscript = meeting.conversation
            .flatMap((message) => {
                if (!("speaker" in message) || !("text" in message)) return [];
                if (["skipped", "awaiting_human_question", "awaiting_human_panelist"].includes(message.type)) return [];
                return [this.renderConversationLine(message, meeting)];
            })
            .slice(-HUMAN_TARGETING_MAX_CONTEXT_MESSAGES);

        const participantLines = meeting.characters
            .map((character) => `- id: ${character.id} | name: ${character.name} | description: ${character.description}`);

        const systemPrompt = buildSystemPrompt(
            meeting.characters.map((character) => character.id),
            HUMAN_TARGETING_GENERAL_FLOW_KEYWORD
        );
        const userPrompt = buildUserPrompt({
            topicTitle: meeting.topic.title,
            topicDescription: meeting.topic.description,
            participantLines,
            conversationLines: conversationTranscript,
            latestHumanText: humanText,
            allowedTargetIds: [...meeting.characters.map((character) => character.id), HUMAN_TARGETING_GENERAL_FLOW_KEYWORD],
        });

        return [
            {
                role: "system",
                content: systemPrompt,
            },
            {
                role: "user",
                content: userPrompt,
            },
        ];
    }

    private renderConversationLine(message: Message, meeting: StoredMeeting): string {
        const speakerName =
            message.type === "human"
                ? meeting.state?.humanName || "Human"
                : meeting.characters.find((character) => character.id === message.speaker)?.name || message.speaker;

        return `${speakerName}: ${message.text}`;
    }

    private parseOutput(content: string, characters: Character[]): string | undefined {
        const trimmed = content.trim();
        if (trimmed.length === 0) {
            throw new Error("Human target classifier returned empty text");
        }

        const normalized = trimmed.toLowerCase();
        const allowedTargets = [
            HUMAN_TARGETING_GENERAL_FLOW_KEYWORD,
            ...characters.map((character) => character.id.toLowerCase()),
        ];

        const exactCandidate = normalized
            .replace(/[`"'*]/g, "")
            .trim();
        if (allowedTargets.includes(exactCandidate)) {
            return exactCandidate === HUMAN_TARGETING_GENERAL_FLOW_KEYWORD ? undefined : exactCandidate;
        }

        for (const candidate of allowedTargets) {
            const pattern = new RegExp(`\\b${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
            if (pattern.test(normalized)) {
                return candidate === HUMAN_TARGETING_GENERAL_FLOW_KEYWORD ? undefined : candidate;
            }
        }

        throw new Error(`Human target classifier did not return an allowed target id: ${trimmed.slice(0, 160)}`);
    }
}

function buildSystemPrompt(characterIds: string[], generalFlowKeyword: string): string {
    const exampleTargetIds = [...new Set(characterIds.filter((id) => id.trim().length > 0))].slice(0, 2);

    return [
        "You are a classifier.",
        "Your job is to choose which meeting participant should directly answer the latest human question.",
        "Reply with exactly one value from the allowed target ids list and nothing else.",
        "NEVER use JSON.",
        "NEVER explain your choice.",
        "NEVER include markdown, code fences, punctuation, or any extra words.",
        "Rules:",
        `- Use the keyword "${generalFlowKeyword}" if the question is general, ambiguous, or should follow the normal meeting flow.`,
        "- Choose a participant if the human addressed them by name or the recent context makes one participant the best direct responder.",
        `- If there is no clear best direct responder, choose the keyword "${generalFlowKeyword}".`,
        "- target ids is ALWAYS given in english, even if the dialogue is in another language",
        "Valid reply examples:",
        ...exampleTargetIds,
        generalFlowKeyword,
    ].join("\n");
}

function buildUserPrompt(options: {
    topicTitle: string;
    topicDescription: string;
    participantLines: string[];
    conversationLines: string[];
    latestHumanText: string;
    allowedTargetIds: string[];
}): string {
    return [
        `Topic: ${options.topicTitle}`,
        `Topic description: ${options.topicDescription}`,
        "",
        "Participants:",
        options.participantLines.join("\n\n"),
        "",
        "Recent conversation:",
        options.conversationLines.length > 0 ? options.conversationLines.join("\n") : "(no prior conversation)",
        "",
        "Human question:",
        options.latestHumanText,
        "",
        `Allowed target ids: ${options.allowedTargetIds.join(", ")}`,
    ].join("\n");
}
