import { splitSentences } from "../utils/textUtils.js";
import { reportError } from "../../errorbot.js";

/**
 * Handles all interactions with the OpenAI API for text generation.
 * Responsible for building prompt messages, calling the API, and parsing/post-processing the response.
 */
export class DialogGenerator {
    /**
     * @param {object} services - Abstracted service container (must provide getOpenAI)
     * @param {object} options - Global configuration options
     */
    constructor(services, options) {
        this.services = services;
        this.options = options; // This assumes options are passed, or we might need access to current meeting options
    }

    /**
     * Generates a conversational response for a specific character (food or chair).
     * 
     * @param {object} speaker - The character object who is speaking.
     * @param {Array<object>} conversation - The conversation history.
     * @param {object} conversationOptions - Configuration specific to this meeting.
     * @param {number} currentSpeakerIndex - Index of the current speaker in the characters array (used for negative lookahead checks).
     * @returns {Promise<object>} - { response, id, sentences, trimmed, pretrimmed }
     */
    async generateTextFromGPT(speaker, conversation, conversationOptions, currentSpeakerIndex) {
        try {
            const messages = this.buildMessageStack(speaker, conversation, conversationOptions);
            const openai = this.services.getOpenAI();

            const completion = await openai.chat.completions.create({
                model: conversationOptions.options.gptModel,
                max_completion_tokens:
                    speaker.id === conversationOptions.options.chairId
                        ? conversationOptions.options.chairMaxTokens
                        : conversationOptions.options.maxTokens,
                temperature: conversationOptions.options.temperature,
                frequency_penalty: conversationOptions.options.frequencyPenalty,
                presence_penalty: conversationOptions.options.presencePenalty,
                stop: "\n---",
                messages: messages,
            });

            let response = completion.choices[0].message.content
                .trim()
                .replaceAll("**", "");

            let pretrimmedContent;
            if (response.startsWith(speaker.name + ":")) {
                pretrimmedContent = response.substring(0, speaker.name.length + 1);
                response = response.substring(speaker.name.length + 1).trim();
            }

            let trimmedContent;
            let originalResponse = response;

            if (completion.choices[0].finish_reason != "stop") {
                if (conversationOptions.options.trimSentance) {
                    const lastPeriodIndex = response.lastIndexOf(".");
                    if (lastPeriodIndex !== -1) {
                        trimmedContent = originalResponse.substring(lastPeriodIndex + 1);
                        response = response.substring(0, lastPeriodIndex + 1);
                    }
                }

                if (conversationOptions.options.trimParagraph) {
                    const lastNewLineIndex = response.lastIndexOf("\n\n");
                    if (lastNewLineIndex !== -1) {
                        trimmedContent = originalResponse.substring(lastNewLineIndex);
                        response = response.substring(0, lastNewLineIndex);
                    }
                }
            }

            // Check others speaking
            for (var i = 0; i < conversationOptions.characters.length; i++) {
                if (i === currentSpeakerIndex) continue;
                const nameIndex = response.indexOf(conversationOptions.characters[i].name + ":");
                if (nameIndex != -1 && nameIndex < 20) {
                    response = response.substring(0, nameIndex).trim();
                    trimmedContent = originalResponse.substring(nameIndex);
                }
            }

            let sentences = splitSentences(response);

            if (completion.choices[0].finish_reason != "stop") {
                // Check if we can re-add some messages from the end, to put back some of the list of questions that chair often produces
                if (conversationOptions.options.trimChairSemicolon) {
                    if (speaker.id === conversationOptions.options.chairId) {

                        const trimmedSentences = splitSentences(trimmedContent?.trim()).filter((sentence) => sentence.length > 0 && sentence !== ".");

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
            console.error("Error during API call:", error);
            throw error;
        }
    }

    /**
     * Generates a specific interjection or system message (e.g., Chair inviting human).
     * Uses a temporary system prompt injected at the end of the history.
     * 
     * @param {string} interjectionPrompt - The specific instruction for this turn (e.g. "Invite the human").
     * @param {number} index - The conversation index context (usually end).
     * @param {number} length - Max tokens.
     * @param {boolean} dontStop - If true, ignores standard stop tokens.
     * @param {Array<object>} conversation 
     * @param {object} conversationOptions 
     * @param {object} socket - Socket for error emission.
     * @returns {Promise<object>} - { response, id }
     */
    async chairInterjection(interjectionPrompt, index, length, dontStop, conversation, conversationOptions, socket) {
        try {
            const chair = conversationOptions.characters[0];
            let messages = this.buildMessageStack(chair, conversation, conversationOptions, index);

            messages.push({
                role: "system",
                content: interjectionPrompt,
            });

            const openai = this.services.getOpenAI();
            const completion = await openai.chat.completions.create({
                model: conversationOptions.options.gptModel,
                max_completion_tokens: length,
                temperature: conversationOptions.options.temperature,
                frequency_penalty: conversationOptions.options.frequencyPenalty,
                presence_penalty: conversationOptions.options.presencePenalty,
                stop: dontStop ? "" : "\n---",
                messages: messages,
            });

            let response = completion.choices[0].message.content.trim();

            if (response.startsWith(chair.name + ":")) {
                response = response.substring(chair.name.length + 1).trim();
            } else if (response.startsWith("**" + chair.name + "**:")) {
                response = response.substring(chair.name.length + 5).trim();
            }

            return { response, id: completion.id };
        } catch (error) {
            console.error("Error during conversation:", error);
            if (socket) {
                socket.emit("conversation_error", {
                    message: "An error occurred during the conversation.",
                    code: 500,
                });
            }
            reportError(error);
            return { response: "", id: null };
        }
    }

    /**
     * Constructs the array of message objects (system, user, assistant) for the GPT API.
     * 
     * @param {object} speaker - The character who needs to speak next.
     * @param {Array<object>} conversation - History.
     * @param {object} conversationOptions - Meeting context.
     * @param {number} [upToIndex] - Optional limit to truncate history.
     * @returns {Array<object>} - Messages array for OpenAI.
     */
    buildMessageStack(speaker, conversation, conversationOptions, upToIndex) {
        let messages = [];

        messages.push({
            role: "system",
            content: `${conversationOptions.topic}\n\n${speaker.prompt}`.trim(),
        });

        for (const msg of conversation) {
            if (msg.type === "skipped") continue;

            const speakerName = msg.type === 'human' ? (conversationOptions.state?.humanName || "Human") : (conversationOptions.characters.find(c => c.id === msg.speaker)?.name || "Unknown");
            messages.push({
                role: speaker.id === msg.speaker ? "assistant" : "user",
                content: speakerName + ": " + msg.text + "\n---",
            });
        }

        if (upToIndex !== undefined) {
            // Original logic: messages.slice(0, 1 + upToIndex)
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
