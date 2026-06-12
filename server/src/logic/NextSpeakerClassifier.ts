import type { Character, Message } from "@shared/ModelTypes.js";
import type { StoredMeeting } from "@models/DBModels.js";
import type { GlobalOptions } from "@logic/GlobalOptions.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { Logger } from "@utils/Logger.js";
import {
    CLASSIFIER_GENERAL_FLOW_KEYWORD,
    CLASSIFIER_MAX_TOKENS,
    normalizeClassifierTargetId,
    parseClassifierOutput,
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
                latestText,
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
        latestText: string,
        eligibleCharacters: Character[]
    ): Promise<{ rawOutput: string; parsedTarget?: string }> {
        const allowedTargetIds = buildAllowedTargetIds(eligibleCharacters);

        const content = await requestSpeakerClassifierCompletion(
            this.serverOptions,
            this.buildMessages(latestText, eligibleCharacters, allowedTargetIds),
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
        latestText: string,
        eligibleCharacters: Character[],
        allowedTargetIds: string[]
    ): ChatCompletionMessageParam[] {
        const participantLines = eligibleCharacters.map(
            (character) => `- ${character.id} | ${character.name}`
        );

        return [
            { role: "system", content: buildSystemPrompt(eligibleCharacters, CLASSIFIER_GENERAL_FLOW_KEYWORD) },
            {
                role: "user",
                content: buildUserPrompt({
                    participantLines,
                    latestText,
                    allowedTargetIds,
                }),
            },
        ];
    }
}

function buildAllowedTargetIds(eligibleCharacters: Character[]): string[] {
    const ids = eligibleCharacters.map((character) => character.id);
    const names = eligibleCharacters.map((character) => character.name);
    return [...ids, ...names, CLASSIFIER_GENERAL_FLOW_KEYWORD];
}

function buildSystemPrompt(eligibleCharacters: Character[], generalFlowKeyword: string): string {
    const exampleTarget = eligibleCharacters[0];
    const exampleId = exampleTarget?.id ?? "alice";
    const exampleName = exampleTarget?.name ?? "Alice";

    return [
        "You classify who is asked a direct question in a council message.",
        `Always reply with exactly one token: a participant id, or "${generalFlowKeyword}".`,
        "Never leave your reply blank. No JSON, explanation, or punctuation.",
        "",
        "Rules:",
        "- If the message asks one participant a direct question by name, return their id.",
        "- Naming several participants earlier does not matter if the message ends by asking one person.",
        "- If there is no direct question to one person, return the keyword.",
        "",
        "Examples:",
        `- "Welcome... we have ${exampleName} and others. ${exampleName}, what's your experience?" → ${exampleId}`,
        `- "${exampleName}, what do you think?" → ${exampleId}`,
        `- "Oh, ${exampleName}, you are completely wrong." → ${generalFlowKeyword}`,
        `- "What should we all do next?" → ${generalFlowKeyword}`,
    ].join("\n");
}

function buildUserPrompt(options: {
    participantLines: string[];
    latestText: string;
    allowedTargetIds: string[];
}): string {
    return [
        "Eligible participants (id | name):",
        options.participantLines.join("\n"),
        "",
        "Latest message:",
        options.latestText,
        "",
        `Reply with one of: ${options.allowedTargetIds.join(", ")}`,
    ].join("\n");
}
