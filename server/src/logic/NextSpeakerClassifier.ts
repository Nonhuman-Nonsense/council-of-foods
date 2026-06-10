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
        const allowedTargetIds = buildAllowedTargetIds(eligibleCharacters);
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

        const systemPrompt = buildSystemPrompt(CLASSIFIER_GENERAL_FLOW_KEYWORD);
        const userPrompt = buildUserPrompt({
            participantLines,
            chairLine: chair ? `- id: ${chair.id} | name: ${chair.name} (not an eligible target)` : undefined,
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

function buildAllowedTargetIds(eligibleCharacters: Character[]): string[] {
    const ids = eligibleCharacters.map((character) => character.id);
    const names = eligibleCharacters.map((character) => character.name);
    return [...ids, ...names, CLASSIFIER_GENERAL_FLOW_KEYWORD];
}

function buildSystemPrompt(generalFlowKeyword: string): string {
    return [
        "You are a classifier.",
        "Does the latest message ask a direct question to one specific eligible participant?",
        `Reply with exactly one token: that participant's id, or "${generalFlowKeyword}".`,
        "No JSON. No explanation. No punctuation or extra words.",
        "",
        `Return a participant id when the message directly asks that person a question (by name or clear address).`,
        `Return "${generalFlowKeyword}" when there is no direct question to one participant, the question is general, or you are unsure.`,
        "",
        "Examples:",
        '- "Alice, what do you think?" → alice',
        '- "Bob, how would you handle this?" → bob',
        '- "Oh, Alice, you are completely wrong." → anyone',
        '- "This affects all of us." → anyone',
    ].join("\n");
}

function buildUserPrompt(options: {
    participantLines: string[];
    chairLine?: string;
    conversationLines: string[];
    latestMessageLine: string;
    allowedTargetIds: string[];
}): string {
    return [
        "Eligible participants:",
        options.participantLines.join("\n"),
        ...(options.chairLine ? ["", "Chair (not an eligible target):", options.chairLine] : []),
        "",
        "Recent conversation:",
        options.conversationLines.length > 0 ? options.conversationLines.join("\n") : "(no prior conversation)",
        "",
        "Latest message to classify:",
        options.latestMessageLine,
        "",
        `Allowed replies (participant id or "${CLASSIFIER_GENERAL_FLOW_KEYWORD}"): ${options.allowedTargetIds.join(", ")}`,
    ].join("\n");
}
