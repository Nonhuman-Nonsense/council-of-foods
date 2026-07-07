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
    /** Character id for participant handoff; human display name for human questions */
    speakerId: string;
}

type ClassifierBuildOptions = SpeakerTargetRequest & {
    eligibleCharacters: Character[];
    allowedTargetIds: string[];
};

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
                buildClassifierMessages(meeting, { ...request, eligibleCharacters, allowedTargetIds }),
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

            return targetId;
        } catch (error) {
            Logger.warn(
                "meeting",
                `SpeakerTargetClassifier:${request.mode} failed, falling back to normal flow.`,
                { error: error as Error, from: { meetingId: meeting._id } },
            );
            return undefined;
        }
    }
}

function buildClassifierMessages(
    meeting: StoredMeeting,
    options: ClassifierBuildOptions
): ChatCompletionMessageParam[] {
    if (options.mode === "participantHandoff") {
        return buildParticipantHandoffClassifierMessages(meeting, options);
    }

    return buildHumanQuestionClassifierMessages(meeting, options);
}

function buildHumanQuestionClassifierMessages(
    meeting: StoredMeeting,
    options: Pick<ClassifierBuildOptions, "text" | "allowedTargetIds">
): ChatCompletionMessageParam[] {
    const conversationTranscript = buildConversationTranscript(meeting);
    const participantLines = meeting.characters.map(
        (character) => `- id: ${character.id} | name: ${character.name} | description: ${character.description}`
    );

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
        "Human question:",
        options.text,
        "",
        formatAllowedTargetIdsBlock(options.allowedTargetIds),
        "",
        "Classify which meeting participant should directly answer the human question:",
    ].join("\n");

    return [
        { role: "system", content: buildHumanQuestionClassifierSystemPrompt(options.allowedTargetIds) },
        { role: "user", content: userPrompt },
    ];
}

function buildParticipantHandoffClassifierMessages(
    meeting: StoredMeeting,
    options: Pick<ClassifierBuildOptions, "text" | "speakerId" | "allowedTargetIds">
): ChatCompletionMessageParam[] {
    const latestMessageLine = renderConversationLine(
        { speaker: options.speakerId, text: options.text, type: "message" } as Message,
        meeting
    );

    const userPrompt = [
        "Latest message:",
        latestMessageLine,
        "",
        formatAllowedTargetIdsBlock(options.allowedTargetIds),
        "",
        "If the latest message contains a direct question to one participant, reply with that participant's id. Otherwise reply with anyone:",
    ].join("\n");

    return [
        { role: "system", content: buildParticipantHandoffClassifierSystemPrompt(options.allowedTargetIds) },
        { role: "user", content: userPrompt },
    ];
}

function formatAllowedTargetIdsBlock(allowedTargetIds: string[]): string {
    return ["Allowed target ids:", ...allowedTargetIds].join("\n");
}

function buildHumanQuestionClassifierSystemPrompt(allowedTargetIds: string[]): string {
    const generalFlowKeyword = CLASSIFIER_GENERAL_FLOW_KEYWORD;

    return [
        "You are a classifier.",
        "Your job is to choose which meeting participant should directly answer the latest human question.",
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

function buildParticipantHandoffClassifierSystemPrompt(allowedTargetIds: string[]): string {
    const generalFlowKeyword = CLASSIFIER_GENERAL_FLOW_KEYWORD;

    return [
        "You are a classifier.",
        "Your job is to detect whether the latest council message contains a direct question to one specific participant.",
        "Reply with exactly one allowed target id and nothing else.",
        "NEVER use JSON.",
        "NEVER explain your choice.",
        "NEVER include markdown, code fences, punctuation, or any extra words.",
        "Rules:",
        `- Use the keyword "${generalFlowKeyword}" unless the latest message directly asks one participant a clear question.`,
        `- Use the keyword "${generalFlowKeyword}" for statements, reactions, agreement, disagreement, monologues, rhetorical questions, and questions to the group.`,
        "- Choose a participant id only when the latest message clearly and directly asks that participant a question.",
        `- If unsure, choose the keyword "${generalFlowKeyword}".`,
        "- target ids is ALWAYS given in english, even if the dialogue is in another language",
        formatAllowedTargetIdsBlock(allowedTargetIds),
    ].join("\n");
}
