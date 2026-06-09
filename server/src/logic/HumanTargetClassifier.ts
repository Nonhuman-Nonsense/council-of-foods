import type { Character } from "@shared/ModelTypes.js";
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
    requestSpeakerClassifierCompletion,
} from "@logic/SpeakerClassifierBase.js";

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

            const normalizedTargetId = normalizeClassifierTargetId(rawTarget, meeting.characters);
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
        return normalizeClassifierTargetId(targetId, characters);
    }

    private async classifyTarget(meeting: StoredMeeting, humanText: string): Promise<string | undefined> {
        const allowedTargetIds = [
            ...meeting.characters.map((character) => character.id),
            CLASSIFIER_GENERAL_FLOW_KEYWORD,
        ];
        const content = await requestSpeakerClassifierCompletion(
            this.serverOptions,
            this.buildMessages(meeting, humanText, allowedTargetIds),
            CLASSIFIER_MAX_TOKENS,
            "HumanTargetClassifier"
        );
        if (content.trim().length === 0) return undefined;
        return parseClassifierOutput(content, allowedTargetIds);
    }

    private buildMessages(
        meeting: StoredMeeting,
        humanText: string,
        allowedTargetIds: string[]
    ): ChatCompletionMessageParam[] {
        const conversationTranscript = buildConversationTranscript(meeting);
        const participantLines = meeting.characters.map(
            (character) => `- id: ${character.id} | name: ${character.name} | description: ${character.description}`
        );

        const systemPrompt = buildSystemPrompt(
            meeting.characters.map((character) => character.id),
            CLASSIFIER_GENERAL_FLOW_KEYWORD
        );
        const userPrompt = buildUserPrompt({
            topicTitle: meeting.topic.title,
            topicDescription: meeting.topic.description,
            participantLines,
            conversationLines: conversationTranscript,
            latestHumanText: humanText,
            allowedTargetIds,
        });

        return [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ];
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
