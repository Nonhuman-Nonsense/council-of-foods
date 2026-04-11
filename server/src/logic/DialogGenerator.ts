import type { Character, Message } from '@shared/ModelTypes.js';
import type { IMeetingBroadcaster } from "@interfaces/MeetingInterfaces.js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { Collection } from "mongodb";
import type { StoredMeeting } from "@models/DBModels.js";

import { splitSentences } from "@utils/textUtils.js";
import { Logger } from "@utils/Logger.js";
import { GlobalOptions } from "./GlobalOptions.js";
import { OpenAI } from "openai";
import { withNetworkRetry } from "@utils/NetworkUtils.js";

export interface Services {
    getOpenAI: () => OpenAI;
    meetingsCollection: Collection<StoredMeeting>;
}

export interface GPTResponse {
    id: string | null;
    response: string;
    sentences?: string[];
    trimmed?: string;
    pretrimmed?: string;
}

/**
 * Handles all interactions with the OpenAI API for text generation.
 * Responsible for building prompt messages, calling the API, and parsing/post-processing the response.
 */
export class DialogGenerator {
    services: Services;
    serverOptions: GlobalOptions;

    /**
     * @param {object} services - Abstracted service container (must provide getOpenAI)
     * @param {object} serverOptions - Global configuration options
     */
    constructor(services: Services, serverOptions: GlobalOptions) {
        this.services = services;
        this.serverOptions = serverOptions; // This assumes options are passed, or we might need access to current meeting options
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
        contextInfo: string
    ): Promise<GPTResponse> {
        let attempt = 1;
        let output: GPTResponse = {
            response: "",
            id: null,
            sentences: [],
            trimmed: undefined,
            pretrimmed: undefined
        };

        const maxAttempts = 5;

        while (attempt < maxAttempts && output.response === "") {
            output = await this.generateTextFromGPT(
                speaker,
                meeting,
                currentSpeakerIndex
            );

            if (shouldAbort()) {
                // Return whatever we have (likely empty or partial) or a specific "aborted" response?
                // The caller will check state anyway.
                return output;
            }

            attempt++;
            if (output.response === "") {
                Logger.warn(contextInfo, `entire message trimmed, trying again. attempt ${attempt}`);
            }
        }
        return output;
    }

    /**
     * Generates a conversational response for a specific character (food or chair).
     */
    async generateTextFromGPT(speaker: Character, meeting: StoredMeeting, currentSpeakerIndex: number): Promise<GPTResponse> {
        try {
            const messages = this.buildMessageStack(speaker, meeting.conversation, meeting);
            const openai = this.services.getOpenAI();

            const completion = await withNetworkRetry(() => openai.chat.completions.create({
                model: this.serverOptions.gptModel,
                max_completion_tokens:
                    speaker.id === this.serverOptions.chairId
                        ? this.serverOptions.chairMaxTokens
                        : this.serverOptions.maxTokens,
                temperature: this.serverOptions.temperature,
                frequency_penalty: this.serverOptions.frequencyPenalty,
                presence_penalty: this.serverOptions.presencePenalty,
                stop: "\n---",
                messages: messages,
            }), "DialogGenerator");

            if (!completion.choices[0].message.content) {
                throw new Error("No content received from GPT");
            }

            let response = completion.choices[0].message.content
                .trim()
                .replaceAll("**", "");

            let pretrimmedContent: string | undefined;
            if (response.startsWith(speaker.name + ":")) {
                pretrimmedContent = response.substring(0, speaker.name.length + 1);
                response = response.substring(speaker.name.length + 1).trim();
            }

            let trimmedContent: string | undefined;
            let originalResponse = response;

            if (completion.choices[0].finish_reason != "stop") {
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
            for (var i = 0; i < meeting.characters.length; i++) {
                if (i === currentSpeakerIndex) continue;
                const nameIndex = response.indexOf(meeting.characters[i].name + ":");
                if (nameIndex != -1 && nameIndex < 20) {
                    response = response.substring(0, nameIndex).trim();
                    trimmedContent = originalResponse.substring(nameIndex);
                }
            }

            let sentences = splitSentences(response);

            if (completion.choices[0].finish_reason != "stop") {
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
                id: completion.id,
                response: response,
                sentences: sentences,
                trimmed: trimmedContent,
                pretrimmed: pretrimmedContent,
            };
        } catch (error) {
            //Just log and rethrow
            Logger.error("DialogGenerator", "Error during response generation", error);
            throw error;
        }
    }

    /**
     * Generates a specific interjection or system message (e.g., Chair inviting human).
     * Uses a temporary system prompt injected at the end of the history.
     */
    async chairInterjection(interjectionPrompt: string, index: number, length: number, dontStop: boolean, meeting: StoredMeeting, broadcaster: IMeetingBroadcaster): Promise<GPTResponse> {
        try {
            const chair = meeting.characters[0];
            let messages = this.buildMessageStack(chair, meeting.conversation, meeting, index);

            messages.push({
                role: "system",
                content: interjectionPrompt,
            });

            const openai = this.services.getOpenAI();
            const completion = await withNetworkRetry(() => openai.chat.completions.create({
                model: this.serverOptions.gptModel,
                max_completion_tokens: length,
                temperature: this.serverOptions.temperature,
                frequency_penalty: this.serverOptions.frequencyPenalty,
                presence_penalty: this.serverOptions.presencePenalty,
                stop: dontStop ? undefined : "\n---",
                messages: messages,
            }), "DialogGenerator");

            if (!completion.choices[0].message.content) {
                return { response: "", id: completion.id };
            }

            let response = completion.choices[0].message.content.trim();

            if (response.startsWith(chair.name + ":")) {
                response = response.substring(chair.name.length + 1).trim();
            } else if (response.startsWith("**" + chair.name + "**:")) {
                response = response.substring(chair.name.length + 5).trim();
            }

            return { response, id: completion.id };
        } catch (error) {
            //Just log and rethrow
            Logger.error("DialogGenerator", "Error during chair interjection", error);
            throw error;
        }
    }

    /**
     * Constructs the array of message objects (system, user, assistant) for the GPT API.
     */
    buildMessageStack(speaker: Character, conversation: Message[], meeting: StoredMeeting, upToIndex?: number): ChatCompletionMessageParam[] {
        let messages: ChatCompletionMessageParam[] = [];

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

        messages.push({
            role: "system",
            content: speaker.name + ": ",
        });

        return messages;
    }
}
