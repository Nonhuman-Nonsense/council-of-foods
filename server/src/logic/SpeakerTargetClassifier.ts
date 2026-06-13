import type { Character, Message } from "@shared/ModelTypes.js";
import type { StoredMeeting } from "@models/DBModels.js";
import type { GlobalOptions } from "@logic/GlobalOptions.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

import { Logger } from "@utils/Logger.js";
import {
    buildConversationTranscript,
    CLASSIFIER_GENERAL_FLOW_KEYWORD,
    CLASSIFIER_MAX_TOKENS,
    renderConversationLine,
    requestSpeakerClassifierCompletion,
    resolveClassifierTarget,
} from "@logic/SpeakerClassifierBase.js";

export type SpeakerTargetMode = "humanQuestion" | "participantHandoff";

export interface SpeakerTargetRequest {
    mode: SpeakerTargetMode;
    text: string;
    /** Who spoke this utterance — required for participant handoff */
    speakerId?: string;
}

export class SpeakerTargetClassifier {
    private serverOptions: GlobalOptions;

    constructor(serverOptions: GlobalOptions) {
        this.serverOptions = serverOptions;
    }

    /** Returns a participant id when one should answer directly, otherwise undefined. */
    async inferTarget(meeting: StoredMeeting, request: SpeakerTargetRequest): Promise<string | undefined> {
        if (request.text.trim().length === 0) {
            return undefined;
        }

        const eligibleCharacters =
            request.mode === "humanQuestion"
                ? meeting.characters
                : meeting.characters.filter((character) => character.id !== this.serverOptions.chairId);
        const allowedTargetIds = [
            ...eligibleCharacters.map((character) => character.id),
            CLASSIFIER_GENERAL_FLOW_KEYWORD,
        ];

        try {
            const content = await requestSpeakerClassifierCompletion(
                this.serverOptions,
                buildClassifierMessages(meeting, {
                    mode: request.mode,
                    text: request.text,
                    speakerId: request.speakerId,
                    eligibleCharacters,
                    allowedTargetIds,
                }),
                CLASSIFIER_MAX_TOKENS,
                `SpeakerTargetClassifier:${request.mode}`
            );

            const targetId = resolveClassifierTarget(content, allowedTargetIds, eligibleCharacters);
            if (!targetId) {
                return undefined;
            }

            if (request.mode === "participantHandoff" && targetId === request.speakerId) {
                return undefined;
            }

            Logger.info(`meeting ${meeting._id}`, `directed to ${targetId}`);
            return targetId;
        } catch (error) {
            Logger.warn(
                `meeting ${meeting._id}`,
                `SpeakerTargetClassifier:${request.mode} failed, falling back to normal flow.`,
                error as Error
            );
            return undefined;
        }
    }
}

function buildClassifierMessages(
    meeting: StoredMeeting,
    options: {
        mode: SpeakerTargetMode;
        text: string;
        speakerId?: string;
        eligibleCharacters: Character[];
        allowedTargetIds: string[];
    }
): ChatCompletionMessageParam[] {
    const conversationTranscript = buildConversationTranscript(meeting);
    const participantLines = meeting.characters.map(
        (character) => `- id: ${character.id} | name: ${character.name} | description: ${character.description}`
    );
    const latestMessageLine =
        options.mode === "participantHandoff" && options.speakerId
            ? renderConversationLine(
                  { speaker: options.speakerId, text: options.text, type: "message" } as Message,
                  meeting
              )
            : options.text;

    const systemPrompt = buildClassifierSystemPrompt(
        options.allowedTargetIds,
        options.mode
    );

    const utteranceLabel = options.mode === "humanQuestion" ? "Human question:" : "Latest message:";
    const classificationPrompt =
        options.mode === "humanQuestion"
            ? "Classify which meeting participant should directly answer the human question:"
            : "Classify which meeting participant should directly answer the latest council message:";

    const userPrompt = [
        `Topic: ${meeting.topic.title}`,
        `Topic description: ${meeting.topic.description}`,
        "",
        "Participants:",
        participantLines.join("\n\n"),
        "",
        "Recent conversation:",
        conversationTranscript.length > 0 ? conversationTranscript.join("\n") : "(no prior conversation)",
        "",
        utteranceLabel,
        latestMessageLine,
        "",
        formatAllowedTargetIdsBlock(options.allowedTargetIds),
        "",
        classificationPrompt,
    ].join("\n");

    return [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
    ];
}

function formatAllowedTargetIdsBlock(allowedTargetIds: string[]): string {
    return ["Allowed target ids:", ...allowedTargetIds].join("\n");
}

function buildClassifierSystemPrompt(allowedTargetIds: string[], mode: SpeakerTargetMode): string {
    const generalFlowKeyword = CLASSIFIER_GENERAL_FLOW_KEYWORD;
    const utterance =
        mode === "humanQuestion" ? "latest human question" : "latest council message";

    return [
        "You are a classifier.",
        `Your job is to choose which meeting participant should directly answer the ${utterance}.`,
        "Reply with exactly one allowed target id and nothing else.",
        "NEVER use JSON.",
        "NEVER explain your choice.",
        "NEVER include markdown, code fences, punctuation, or any extra words.",
        "Rules:",
        `- Use the keyword "${generalFlowKeyword}" if the question is general, ambiguous, or should follow the normal meeting flow.`,
        "- Choose a participant if they are addressed by name or the recent context makes one participant the best direct responder.",
        `- If there is no clear best direct responder, choose the keyword "${generalFlowKeyword}".`,
        "- target ids is ALWAYS given in english, even if the dialogue is in another language",
        formatAllowedTargetIdsBlock(allowedTargetIds),
    ].join("\n");
}
