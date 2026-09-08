import type { Character, Message } from '@shared/ModelTypes.js';
import type { IMeetingBroadcaster } from "@interfaces/MeetingInterfaces.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Collection } from "mongodb";
import type { StoredMeeting } from "@models/DBModels.js";

import { splitSentences } from "@shared/textUtils.js";
import { Logger } from "@utils/Logger.js";
import { GlobalOptions } from "./GlobalOptions.js";
import type { ConversationCompletionResult, ConversationService } from "@services/ConversationService.js";
import { withNetworkRetry } from "@utils/NetworkUtils.js";

/**
 * How many times a single generation may be sampled before giving up. A model
 * that returns nothing is nearly always fine on the next sample; one that
 * returns nothing four times running is not going to start.
 */
const GENERATION_ATTEMPTS = 4;

/**
 * The conversation model returned no usable content for a generation, and
 * retrying did not help. Distinct from a transport failure, which never reaches
 * this far — {@link withNetworkRetry} owns those.
 */
export class EmptyCompletionError extends Error {
    constructor(operation: string, attempts: number) {
        super(`No content received from the conversation model for ${operation} after ${attempts} attempts`);
        this.name = "EmptyCompletionError";
    }
}

/** Overflow trimming for summary documents — independent of global turn settings. */
const DOCUMENT_TRIM_SENTENCE = false;
const DOCUMENT_TRIM_PARAGRAPH = true;

export interface Services {
    conversationService: ConversationService;
    meetingsCollection: Collection<StoredMeeting>;
}

export interface DialogResponse {
    id: string | null;
    response: string;
    sentences?: string[];
    trimmed?: string;
    pretrimmed?: string;
}

export interface DocumentResponse {
    id: string | null;
    response: string;
    trimmed?: string;
}

type PostProcessedResponse = Omit<DialogResponse, "id">;

/**
 * Handles all interactions with the configured conversation completion provider.
 * Responsible for building prompt messages, calling the API, and parsing/post-processing the response.
 */
export class DialogGenerator {
    services: Services;
    serverOptions: GlobalOptions;

    /**
     * @param {object} services - Abstracted service container (must provide conversationService)
     * @param {object} serverOptions - Global configuration options
     */
    constructor(services: Services, serverOptions: GlobalOptions) {
        this.services = services;
        this.serverOptions = serverOptions; // This assumes options are passed, or we might need access to current meeting options
    }

    /**
     * Calls the conversation model and insists on usable text.
     *
     * Two failures look different but mean the same thing — the turn produced
     * nothing to say — and both are worth another sample:
     *
     * - the model returned no content at all;
     * - it returned content that post-processing trimmed away entirely.
     *
     * Only the second used to be retried, and only for council turns, so an
     * empty completion anywhere ended the meeting on the first try. Transport
     * failures are a different problem and stay with `withNetworkRetry` inside
     * {@link requestChatCompletion}.
     *
     * Exhausting the attempts preserves what each failure meant before: no
     * content at all throws, so the caller can decide the meeting is over;
     * trimmed-to-nothing returns the empty result, which callers already
     * tolerate.
     *
     * Both are rare enough to be worth hearing about even when a retry saves
     * the turn, so every failed attempt is reported, not just a fatal one.
     */
    private async completeWithRetry<T extends PostProcessedResponse | Pick<DocumentResponse, "response" | "trimmed">>(
        request: {
            messages: ChatCompletionMessageParam[];
            maxCompletionTokens: number;
            stop?: string[];
        },
        postProcess: (completion: ConversationCompletionResult) => T,
        ctx: {
            /** Names the generation in logs and in the error a caller sees. */
            operation: string;
            meeting: StoredMeeting;
            /**
             * Interrupts (hand raise, pause, teardown), checked between attempts.
             * Aborting returns an empty response, so only pass one from a caller
             * that re-checks the same condition and discards the result — the
             * council turn does; nothing else needs to, since the run loop stops
             * at its next boundary anyway.
             */
            shouldAbort?: () => boolean;
        },
    ): Promise<{ id: string | null } & T> {
        const { operation, meeting, shouldAbort } = ctx;
        let lastEmpty: { id: string | null } & T | null = null;

        for (let attempt = 1; attempt <= GENERATION_ATTEMPTS; attempt++) {
            const completion = await this.requestChatCompletion(
                request.messages,
                request.maxCompletionTokens,
                request.stop,
            );

            if (completion.content) {
                const processed = postProcess(completion);
                if (processed.response !== "") {
                    return { id: completion.id, ...processed };
                }
                lastEmpty = { id: completion.id, ...processed };
            }

            const reason = completion.content ? "entire message trimmed" : "no content received";
            void Logger.warn(
                "DialogGenerator",
                `${operation}: ${reason} (attempt ${attempt}/${GENERATION_ATTEMPTS})`,
                { from: { meetingId: meeting._id }, clientImpact: "none" },
            );

            // After the warning, so an interrupted turn still reports the empty
            // sample it already paid for.
            if (shouldAbort?.()) {
                return lastEmpty ?? { id: completion.id, ...postProcess({ ...completion, content: "" }) };
            }
        }

        if (lastEmpty) {
            return lastEmpty;
        }

        throw new EmptyCompletionError(operation, GENERATION_ATTEMPTS);
    }

    /**
     * Generates a conversational response with built-in retry logic for empty responses.
     * Checks the `shouldAbort` callback between attempts to respect interrupts (e.g. Hand Raising).
     */
    async generateResponseWithRetry(
        speaker: Character,
        meeting: StoredMeeting,
        currentSpeakerIndex: number,
        shouldAbort: () => boolean,
    ): Promise<DialogResponse> {
        return this.generateResponse(speaker, meeting, currentSpeakerIndex, shouldAbort);
    }

    /**
     * Strips speaker prefixes and applies flag-driven trimming for overflow content.
     */
    private postProcessResponse(
        rawContent: string,
        speaker: Character,
        meeting: StoredMeeting,
        currentSpeakerIndex: number,
        finishReason: string | null
    ): PostProcessedResponse {
        let response = rawContent
            .trim()
            .replaceAll("**", "")
            .replace(/\n+---\s*$/u, "");

        let pretrimmedContent: string | undefined;
        if (response.startsWith(speaker.name + ":")) {
            pretrimmedContent = response.substring(0, speaker.name.length + 1);
            response = response.substring(speaker.name.length + 1).trim();
        }

        let trimmedContent: string | undefined;
        const originalResponse = response;

        if (finishReason !== "stop") {
            if (this.serverOptions.trimSentance) {
                const lastPeriodIndex = response.lastIndexOf(".");
                if (lastPeriodIndex !== -1) {
                    trimmedContent = originalResponse.substring(lastPeriodIndex + 1);
                    response = response.substring(0, lastPeriodIndex + 1);
                }
            }

            if (this.serverOptions.trimParagraph) {
                const lastNewLineIndex = response.lastIndexOf("\n\n");
                if (lastNewLineIndex !== -1) {
                    trimmedContent = originalResponse.substring(lastNewLineIndex);
                    response = response.substring(0, lastNewLineIndex);
                }
            }
        }

        // Check others speaking
        for (let i = 0; i < meeting.characters.length; i++) {
            if (i === currentSpeakerIndex) continue;
            const nameIndex = response.indexOf(meeting.characters[i].name + ":");
            if (nameIndex != -1 && nameIndex < 20) {
                response = response.substring(0, nameIndex).trim();
                trimmedContent = originalResponse.substring(nameIndex);
            }
        }

        let sentences = splitSentences(response);

        if (finishReason !== "stop") {
            // Check if we can re-add some messages from the end, to put back some of the list of questions that chair often produces
            if (this.serverOptions.trimChairSemicolon) {
                if (speaker.id === this.serverOptions.chairId) {
                    const trimmedSentences = splitSentences(trimmedContent?.trim() || "").filter((sentence) => sentence.length > 0 && sentence !== ".");

                    if (
                        trimmedSentences &&
                        sentences &&
                        (sentences[sentences.length - 1]?.slice(-1) === ":" ||
                            trimmedSentences[0]?.slice(-1) === ":")
                    ) {
                        if (
                            trimmedSentences.length > 2 &&
                            trimmedSentences[0]?.slice(0, 1) === "1" &&
                            trimmedSentences[1]?.slice(0, 1) === "2"
                        ) {
                            trimmedContent = trimmedSentences[trimmedSentences.length - 1];
                            sentences = sentences.concat(trimmedSentences.slice(0, trimmedSentences.length - 1));
                            response = sentences.join("\n");
                        } else if (
                            trimmedSentences.length > 3 &&
                            trimmedSentences[0]?.slice(-1) === ":" &&
                            trimmedSentences[1]?.slice(0, 1) === "1" &&
                            trimmedSentences[2]?.slice(0, 1) === "2"
                        ) {
                            trimmedContent = trimmedSentences[trimmedSentences.length - 1];
                            sentences = sentences.concat(trimmedSentences.slice(0, trimmedSentences.length - 1));
                            response = sentences.join("\n");
                        } else {
                            //otherwise remove also the last presentation of the list of topics
                            trimmedContent = trimmedContent
                                ? sentences[sentences.length - 1] + "\n" + trimmedContent
                                : sentences[sentences.length - 1];
                            sentences = sentences.slice(0, sentences.length - 1);
                            response = sentences.join("\n");
                        }
                    }
                }
            }
        }

        return {
            response,
            sentences,
            trimmed: trimmedContent,
            pretrimmed: pretrimmedContent,
        };
    }

    private stripMarkdownCodeFence(rawContent: string): string {
        let text = rawContent.trim();

        const completeFence = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i.exec(text);
        if (completeFence) {
            return completeFence[1].trim();
        }

        if (/^```(?:markdown|md)?\s*\n?/i.test(text)) {
            text = text.replace(/^```(?:markdown|md)?\s*\n?/i, "");
            text = text.replace(/\n?```\s*$/i, "");
        }

        return text.trim();
    }

    private postProcessDocumentResponse(
        rawContent: string,
        finishReason: string | null,
    ): Pick<DocumentResponse, "response" | "trimmed"> {
        let response = this.stripMarkdownCodeFence(rawContent);
        let trimmedContent: string | undefined;
        const originalResponse = response;

        if (finishReason !== "stop") {
            if (DOCUMENT_TRIM_SENTENCE) {
                const lastPeriodIndex = response.lastIndexOf(".");
                if (lastPeriodIndex !== -1) {
                    trimmedContent = originalResponse.substring(lastPeriodIndex + 1);
                    response = response.substring(0, lastPeriodIndex + 1);
                }
            }

            if (DOCUMENT_TRIM_PARAGRAPH) {
                const lastNewLineIndex = response.lastIndexOf("\n\n");
                if (lastNewLineIndex !== -1) {
                    trimmedContent = originalResponse.substring(lastNewLineIndex);
                    response = response.substring(0, lastNewLineIndex);
                }
            }
        }

        return {
            response,
            trimmed: trimmedContent,
        };
    }

    private async requestChatCompletion(
        messages: ChatCompletionMessageParam[],
        maxCompletionTokens: number,
        stop?: string[],
    ): Promise<ConversationCompletionResult> {
        return withNetworkRetry(() => this.services.conversationService.createChatCompletion({
            model: this.serverOptions.conversationModel,
            maxCompletionTokens,
            temperature: this.serverOptions.temperature,
            reasoning: this.serverOptions.conversationReasoning,
            stop,
            messages,
        }), "DialogGenerator");
    }

    /**
     * Generates a conversational response for a specific character (food or chair).
     */
    async generateResponse(
        speaker: Character,
        meeting: StoredMeeting,
        currentSpeakerIndex: number,
        shouldAbort?: () => boolean,
    ): Promise<DialogResponse> {
        try {
            return await this.completeWithRetry(
                {
                    messages: this.buildMessageStack(speaker, meeting.conversation, meeting),
                    maxCompletionTokens:
                        speaker.id === this.serverOptions.chairId
                            ? this.serverOptions.chairMaxTokens
                            : this.serverOptions.maxTokens,
                    stop: ["\n---"],
                },
                (completion) =>
                    this.postProcessResponse(
                        completion.content ?? "",
                        speaker,
                        meeting,
                        currentSpeakerIndex,
                        completion.finishReason,
                    ),
                { operation: `${speaker.name}'s turn`, meeting, shouldAbort },
            );
        } catch (error) {
            //Just log and rethrow
            Logger.error("DialogGenerator", "Error during response generation", { error, from: { meetingId: meeting._id } });
            throw error;
        }
    }

    /**
     * Generates a specific interjection or system message (e.g., Chair inviting human).
     * Uses a temporary system prompt injected at the end of the history.
     */
    async chairInterjection(
        interjectionPrompt: string,
        index: number,
        length: number,
        meeting: StoredMeeting,
        _broadcaster: IMeetingBroadcaster,
    ): Promise<DialogResponse> {
        try {
            const chair = meeting.characters[0];
            const messages = this.buildMessageStack(chair, meeting.conversation, meeting, index);

            messages.push({
                role: "system",
                content: interjectionPrompt,
            });

            messages.push({
                role: "system",
                content: chair.name + ": ",
            });

            return await this.completeWithRetry(
                { messages, maxCompletionTokens: length, stop: ["\n---"] },
                (completion) =>
                    this.postProcessResponse(
                        completion.content ?? "",
                        chair,
                        meeting,
                        0,
                        completion.finishReason,
                    ),
                { operation: "chair interjection", meeting },
            );
        } catch (error) {
            //Just log and rethrow
            Logger.error("DialogGenerator", "Error during chair interjection", { error, from: { meetingId: meeting._id } });
            throw error;
        }
    }

    /**
     * Generates a written markdown document (e.g. meeting summary).
     * Unlike chair interjections, allows markdown horizontal rules and does not use conversation stop sequences.
     */
    async generateDocument(
        documentPrompt: string,
        meeting: StoredMeeting,
        maxTokens: number,
    ): Promise<DocumentResponse> {
        try {
            const chair = meeting.characters[0];
            const messages = this.buildMessageStack(chair, meeting.conversation, meeting, undefined, false);

            messages.push({
                role: "system",
                content: documentPrompt,
            });

            // Set by the last attempt's post-processing, for the log line below.
            let finishReason: string | null = null;

            const result = await this.completeWithRetry(
                { messages, maxCompletionTokens: maxTokens },
                (completion) => {
                    finishReason = completion.finishReason;
                    return this.postProcessDocumentResponse(
                        completion.content ?? "",
                        completion.finishReason,
                    );
                },
                { operation: "summary document", meeting },
            );

            const trimmedNote = result.trimmed
                ? `, trimmed: ${result.trimmed.length} chars`
                : "";
            Logger.info(
                "DialogGenerator",
                `document generated (${result.response.length} chars, finish_reason: ${finishReason ?? "unknown"}${trimmedNote})`,
                { from: { meetingId: meeting._id } },
            );

            return result;
        } catch (error) {
            Logger.error("DialogGenerator", "Error during document generation", { error, from: { meetingId: meeting._id } });
            throw error;
        }
    }

    /**
     * Constructs the array of message objects (system, user, assistant) for the conversation model.
     */
    buildMessageStack(
        speaker: Character,
        conversation: Message[],
        meeting: StoredMeeting,
        upToIndex?: number,
        includeCompletionPrimer = true,
    ): ChatCompletionMessageParam[] {
        const messages: ChatCompletionMessageParam[] = [];

        messages.push({
            role: "system",
            content: `${meeting.topic.prompt}\n\n${speaker.prompt}`.trim(),
        });

        for (const msg of conversation) {
            if (msg.type === "skipped") continue;

            const speakerName = msg.type === 'human' ? (meeting.state?.humanName || "Human") : (meeting.characters.find(c => c.id === msg.speaker)?.name || "Unknown");
            messages.push({
                role: speaker.id === msg.speaker ? "assistant" : "user",
                content: speakerName + ": " + msg.text + "\n---",
            });
        }

        if (upToIndex !== undefined) {
            // 1 (system prompt) + upToIndex.
            return messages.slice(0, 1 + upToIndex);
        }

        if (includeCompletionPrimer) {
            messages.push({
                role: "system",
                content: speaker.name + ": ",
            });
        }

        return messages;
    }
}
