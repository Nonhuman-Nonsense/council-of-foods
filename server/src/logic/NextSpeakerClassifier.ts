import type { Character, Message } from "@shared/ModelTypes.js";
import type { StoredMeeting } from "@models/DBModels.js";
import type { GlobalOptions } from "@logic/GlobalOptions.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { Logger } from "@utils/Logger.js";
import {
    buildConversationTranscript,
    CLASSIFIER_GENERAL_FLOW_KEYWORD,
    CLASSIFIER_MAX_TOKENS,
    normalizeClassifierTargetId,
    parseClassifierOutput,
    renderConversationLine,
    requestSpeakerClassifierCompletion,
} from "@logic/SpeakerClassifierBase.js";

export interface NextSpeakerInference {
    rawOutput: string;
    targetId?: string;
}

export class NextSpeakerClassifier {
    private serverOptions: GlobalOptions;

    constructor(serverOptions: GlobalOptions) {
        this.serverOptions = serverOptions;
    }

    async inferTarget(meeting: StoredMeeting, latestMessage: Message): Promise<NextSpeakerInference> {
        const latestText = "text" in latestMessage ? latestMessage.text : undefined;
        if (!latestText || latestText.trim().length === 0) {
            return { rawOutput: "(empty)" };
        }

        const eligibleCharacters = meeting.characters.filter(
            (character) => character.id !== this.serverOptions.chairId
        );

        try {
            const { rawOutput, parsedTarget } = await this.classifyTarget(
                meeting,
                latestMessage,
                eligibleCharacters
            );

            if (!parsedTarget) {
                return { rawOutput };
            }

            const normalizedTargetId = normalizeClassifierTargetId(parsedTarget, eligibleCharacters);
            if (!normalizedTargetId) {
                Logger.warn(
                    `meeting ${meeting._id}`,
                    `Next speaker classifier returned invalid target "${parsedTarget}", falling back to normal flow.`
                );
                return { rawOutput };
            }

            return { rawOutput, targetId: normalizedTargetId };
        } catch (error) {
            Logger.warn(
                `meeting ${meeting._id}`,
                "Next speaker classifier failed, falling back to normal flow.",
                error as Error
            );
            return { rawOutput: "(error)" };
        }
    }

    private async classifyTarget(
        meeting: StoredMeeting,
        latestMessage: Message,
        eligibleCharacters: Character[]
    ): Promise<{ rawOutput: string; parsedTarget?: string }> {
        const allowedTargetIds = [
            ...eligibleCharacters.map((character) => character.id),
            CLASSIFIER_GENERAL_FLOW_KEYWORD,
        ];
        const content = await requestSpeakerClassifierCompletion(
            this.serverOptions,
            this.buildMessages(meeting, latestMessage, eligibleCharacters, allowedTargetIds),
            CLASSIFIER_MAX_TOKENS,
            "NextSpeakerClassifier"
        );
        const rawOutput = content.trim();
        if (rawOutput.length === 0) {
            return { rawOutput: "(empty)" };
        }

        try {
            const parsedTarget = parseClassifierOutput(content, allowedTargetIds);
            return { rawOutput, parsedTarget };
        } catch {
            return { rawOutput };
        }
    }

    private buildMessages(
        meeting: StoredMeeting,
        latestMessage: Message,
        eligibleCharacters: Character[],
        allowedTargetIds: string[]
    ): ChatCompletionMessageParam[] {
        const participantLines = meeting.characters.map(
            (character) => `- id: ${character.id} | name: ${character.name} | description: ${character.description}`
        );
        const conversationTranscript = buildConversationTranscript(meeting);
        const chair = meeting.characters.find((character) => character.id === this.serverOptions.chairId);

        const systemPrompt = buildSystemPrompt(
            eligibleCharacters.map((character) => character.id),
            CLASSIFIER_GENERAL_FLOW_KEYWORD
        );
        const userPrompt = buildUserPrompt({
            topicTitle: meeting.topic.title,
            topicDescription: meeting.topic.description,
            participantLines,
            chairLine: chair ? `- id: ${chair.id} | name: ${chair.name} (chair — not an eligible target)` : undefined,
            conversationLines: conversationTranscript,
            latestMessageLine: renderConversationLine(latestMessage, meeting),
            allowedTargetIds,
        });

        return [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ];
    }
}

function buildSystemPrompt(exampleTargetIds: string[], generalFlowKeyword: string): string {
    const examples = [...new Set(exampleTargetIds.filter((id) => id.trim().length > 0))].slice(0, 2);

    return [
        "You are a classifier.",
        "Your ONLY job is addressee detection: should one specific eligible participant be given the next turn because the latest message is directed at them?",
        "You are NOT choosing who should speak next in general.",
        "You are NOT balancing turns, rotation, or who has spoken least.",
        "Reply with exactly one value from the allowed target ids list and nothing else.",
        "NEVER use JSON.",
        "NEVER explain your choice.",
        "NEVER include markdown, code fences, punctuation, or any extra words.",
        "Return a participant id ONLY when one of these is true:",
        "- The message asks that participant a direct question.",
        "- The message explicitly invites that specific participant to respond (e.g. 'I'd like to hear from you, Banana').",
        "- The message is a direct reply in a sustained back-and-forth with that participant (they just spoke to the current speaker and the current speaker is answering them).",
        `Return "${generalFlowKeyword}" in all other cases, including:`,
        "- The message only mentions someone by name at the start (e.g. 'Oh, Banana, you...') without asking them a direct question or inviting them to respond.",
        "- The message is a monologue, general statement, or speech to the whole room.",
        "- The message name-checks several participants without one clear addressee.",
        "- The message is directed at the chair or anyone not in the allowed target ids list.",
        "- The addressee is ambiguous or you would be guessing.",
        "- When in doubt.",
        "- target ids is ALWAYS given in english, even if the dialogue is in another language",
        "Valid reply examples:",
        ...examples,
        generalFlowKeyword,
    ].join("\n");
}

function buildUserPrompt(options: {
    topicTitle: string;
    topicDescription: string;
    participantLines: string[];
    chairLine?: string;
    conversationLines: string[];
    latestMessageLine: string;
    allowedTargetIds: string[];
}): string {
    return [
        `Topic: ${options.topicTitle}`,
        `Topic description: ${options.topicDescription}`,
        "",
        "Meeting participants (for context):",
        options.participantLines.join("\n\n"),
        ...(options.chairLine ? ["", "Chair (may be mentioned, but is NOT an eligible target):", options.chairLine] : []),
        "",
        "Recent conversation:",
        options.conversationLines.length > 0 ? options.conversationLines.join("\n") : "(no prior conversation)",
        "",
        "Latest message (who should be given the next turn because this message is directed at them?):",
        options.latestMessageLine,
        "",
        `Allowed target ids (return one of these, or "${CLASSIFIER_GENERAL_FLOW_KEYWORD}" only): ${options.allowedTargetIds.join(", ")}`,
    ].join("\n");
}
