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

        const latestSpeakerId = "speaker" in latestMessage ? latestMessage.speaker : undefined;
        const latestSpeakerName =
            latestSpeakerId === undefined
                ? undefined
                : meeting.characters.find((character) => character.id === latestSpeakerId)?.name || latestSpeakerId;

        const systemPrompt = buildSystemPrompt(eligibleCharacters, CLASSIFIER_GENERAL_FLOW_KEYWORD);
        const userPrompt = buildUserPrompt({
            topicTitle: meeting.topic.title,
            topicDescription: meeting.topic.description,
            participantLines,
            chairLine: chair ? `- id: ${chair.id} | name: ${chair.name} (chair — not an eligible target)` : undefined,
            conversationLines: conversationTranscript,
            latestSpeakerLine: latestSpeakerName ? `${latestSpeakerName} (id: ${latestSpeakerId})` : undefined,
            latestMessageLine: renderConversationLine(latestMessage, meeting),
            allowedTargetIds,
        });

        return [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ];
    }
}

function buildSystemPrompt(eligibleCharacters: Character[], generalFlowKeyword: string): string {
    const first = eligibleCharacters[0];
    const second = eligibleCharacters[1];
    const firstLabel = first ? `${first.name} (id: ${first.id})` : "speaker1";
    const secondLabel = second ? `${second.name} (id: ${second.id})` : "speaker2";
    const firstId = first?.id ?? "speaker1";
    const secondId = second?.id ?? "speaker2";

    return [
        "You are a classifier.",
        "Your ONLY job is addressee detection: is the latest message handing the next turn to one specific eligible participant?",
        "A handoff requires a direct question to them OR an explicit invitation for them to respond.",
        "You are NOT choosing who should speak next in general.",
        "You are NOT balancing turns, rotation, or who has spoken least.",
        "Reply with exactly one value from the allowed target ids list and nothing else.",
        "NEVER use JSON.",
        "NEVER explain your choice.",
        "NEVER include markdown, code fences, punctuation, or any extra words.",
        "Return a participant id ONLY when BOTH are true:",
        "1. The message clearly targets that one participant.",
        "2. AND one of these:",
        "- The message asks them a direct question (question mark, or phrases like 'what do you think', 'how would you', 'can you explain', 'let me ask you').",
        "- The message explicitly invites only that participant to respond (e.g. 'I'd like to hear from you').",
        `Return "${generalFlowKeyword}" in all other cases, including:`,
        "- A rhetorical opener like 'Oh, {name},' or '{name}, darling' followed by statements, insults, praise, or arguments — that is NOT a handoff.",
        "- Rebutting, disagreeing with, or talking about another participant's views without asking them a question.",
        "- Speaking to the room ('folks', 'the world', 'millions', general claims) even if one person is named first.",
        "- The latest speaker mentions someone they were just debating with — that is usually rhetoric, not a turn handoff.",
        "- Monologues, speeches, or council-wide commentary.",
        "- Multiple participants are mentioned without one clear person being asked to respond.",
        "- Directed at the chair or anyone not in the allowed target ids list.",
        "- Ambiguous cases. When in doubt, return the keyword.",
        "- target ids is ALWAYS given in english, even if the dialogue is in another language",
        "Examples that must return the keyword:",
        `- "Oh, ${firstLabel}, you are so wrong. I am the greatest..." → ${generalFlowKeyword}`,
        `- "${firstLabel}, you talk about efficiency but I invented it. That's me, folks..." → ${generalFlowKeyword}`,
        "Examples that may return a specific id:",
        `- "${firstLabel}, what do you think about pesticides?" → ${firstId}`,
        `- "I'd like to hear from ${secondLabel} on this point." → ${secondId}`,
        "Valid reply tokens:",
        firstId,
        secondId,
        generalFlowKeyword,
    ].join("\n");
}

function buildUserPrompt(options: {
    topicTitle: string;
    topicDescription: string;
    participantLines: string[];
    chairLine?: string;
    conversationLines: string[];
    latestSpeakerLine?: string;
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
        ...(options.latestSpeakerLine
            ? [
                  "Latest speaker (who just spoke — mentions of others may be rhetorical rebuttal, not a handoff):",
                  options.latestSpeakerLine,
                  "",
              ]
            : []),
        "Latest message (classify whether this message hands the next turn to one specific participant):",
        options.latestMessageLine,
        "",
        `Allowed target ids (return one of these, or "${CLASSIFIER_GENERAL_FLOW_KEYWORD}" only): ${options.allowedTargetIds.join(", ")}`,
    ].join("\n");
}
