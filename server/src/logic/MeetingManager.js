import { v4 as uuidv4 } from "uuid";
import { getOpenAI } from "../services/OpenAIService.js";
import { meetingsCollection, audioCollection, insertMeeting } from "../services/DbService.js";
import { splitSentences, mapSentencesToWords } from "../utils/textUtils.js";
import { reportError } from "../../errorbot.js";
import defaultGlobalOptions from "../../global-options.json" with { type: 'json' };
import { AudioSystem } from "./AudioSystem.js";

export class MeetingManager {
    constructor(socket, environment, optionsOverride = null, services = {}) {
        this.socket = socket;
        this.environment = environment;
        this.globalOptions = optionsOverride || defaultGlobalOptions;

        // Default Services
        this.services = {
            meetingsCollection: services.meetingsCollection || meetingsCollection,
            audioCollection: services.audioCollection || audioCollection,
            insertMeeting: services.insertMeeting || insertMeeting,
            getOpenAI: services.getOpenAI || getOpenAI
        };

        // Session variables
        this.run = true;
        this.handRaised = false;
        this.isPaused = false;
        this.currentSpeaker = 0;
        this.extraMessageCount = 0;
        this.meetingId = null;
        this.meetingDate = null;

        this.startLoop = this.startLoop.bind(this);
        this.audioSystem = new AudioSystem(this.socket, this.services);

        this.conversation = [];
        this.conversationOptions = {
            topic: "",
            characters: {},
        };

        this.setupListeners();
    }

    setupListeners() {
        if (this.environment === "prototype") {
            this.setupPrototypeListeners();
        }

        this.socket.on("submit_injection", (message) => this.handleSubmitInjection(message));

        this.socket.on("raise_hand", (opts) => this.handleRaiseHand(opts));
        this.socket.on("submit_human_message", (msg) => this.handleSubmitHumanMessage(msg));
        this.socket.on("submit_human_panelist", (msg) => this.handleSubmitHumanPanelist(msg));
        this.socket.on("wrap_up_meeting", (msg) => this.handleWrapUpMeeting(msg));

        this.socket.on("continue_conversation", () => {
            this.extraMessageCount += this.conversationOptions.options.extraMessageCount;
            this.isPaused = false;
            this.startLoop();
        });

        this.socket.on("attempt_reconnection", (opts) => this.handleReconnection(opts));
        this.socket.on("start_conversation", (setup) => this.handleStartConversation(setup));
        this.socket.on("disconnect", () => {
            this.run = false;
            console.log(`[session ${this.socket.id} meeting ${this.meetingId ?? "unstarted"}] disconnected`);
        });

        // OpenAI Realtime API Client Key
        this.socket.on('request_clientkey', async () => this.handleRequestClientKey());
    }

    setupPrototypeListeners() {
        this.socket.on("pause_conversation", () => {
            this.isPaused = true;
            console.log(`[meeting ${this.meetingId}] paused`);
        });

        this.socket.on("resume_conversation", () => {
            console.log(`[meeting ${this.meetingId}] resumed`);
            this.isPaused = false;
            this.startLoop();
        });

        this.socket.on("remove_last_message", () => {
            this.conversation.pop();
            this.socket.emit("conversation_update", this.conversation);
        });
    }

    calculateCurrentSpeaker() {
        if (this.conversation.length === 0) return 0;
        // if (this.conversation.length === 1) return 1; // Why this? Just use loop logic.

        for (let i = this.conversation.length - 1; i >= 0; i--) {
            const msg = this.conversation[i];

            //If last message was human input
            if (msg.type === "human") {
                //And it contained a question to a particular food
                if (msg.askParticular) {
                    // Check if this question was already answered by the next message
                    if (i + 1 < this.conversation.length) {
                        const nextMsg = this.conversation[i + 1];
                        if (nextMsg.type === 'response') {
                            // Check if responder matches the asked person
                            const askerTarget = this.conversationOptions.characters.find(
                                c => c.name === msg.askParticular || c.id === msg.askParticular
                            );
                            if (askerTarget && (nextMsg.speaker === askerTarget.id || nextMsg.speaker === askerTarget.name)) {
                                // Already answered, so this question shouldn't trigger a new turn
                                continue;
                            }
                        }
                    }

                    // Try matching by Name or ID for robustness
                    const index = this.conversationOptions.characters.findIndex(
                        char => char.name === msg.askParticular || char.id === msg.askParticular
                    );
                    if (index !== -1) return index;
                }
                //If just a human question to anyone in the council, skip it and look at previous speaker
                continue;
            }
            //Skip invitations
            if (msg.type === "invitation") continue;

            // Skip direct responses to questions when calculating next speaker
            if (msg.type === 'response') {
                // Determine who *would* have spoken if they hadn't been interrupted.
                // We need to look back before the Human Question to find the "previous" natural speaker.
                // Flow: [FoodA] -> [Human Q] -> [FoodB (Response)] -> [Calculated Next]
                // i = FoodB Response
                // i-1 = Human Q
                // i-2 = FoodA

                // Safe check bounds
                if (i >= 2) {
                    const prevSpeakerId = this.conversation[i - 2].speaker;
                    const indexOfPrev = this.conversationOptions.characters.findIndex(char => char.id === prevSpeakerId);

                    // If found, calculate who should be next
                    if (indexOfPrev !== -1) {
                        // The "Natural Next" after FoodA
                        const nextNaturalIndex = indexOfPrev >= this.conversationOptions.characters.length - 1 ? 0 : indexOfPrev + 1;

                        // If the current responder (FoodB) is NOT the Natural Next,
                        // then this was an out-of-turn response. We should ignore it 
                        // and resume the natural order (so return Natural Next).
                        // BUT, the loop below simply "calculates next from current found speaker".
                        // So if we just 'continue' here, we skip FoodB, skip Human, find FoodA, and standard logic returns Natural Next.

                        // Check if FoodB == Natural Next.
                        const currentResponderId = msg.speaker;
                        const currentResponderIndex = this.conversationOptions.characters.findIndex(char => char.id === currentResponderId);

                        if (currentResponderIndex !== nextNaturalIndex) {
                            // It was out of turn. Skip this message so we find FoodA.
                            continue;
                        }
                    }
                }
            }

            const lastSpeakerIndex = this.conversationOptions.characters.findIndex(
                (char) => char.id === msg.speaker
            );

            // If speaker not found (e.g. 'chair'), skip
            if (lastSpeakerIndex === -1) continue;

            return lastSpeakerIndex >= this.conversationOptions.characters.length - 1
                ? 0
                : lastSpeakerIndex + 1;
        }
        return 0; // Default fallback
    }

    async handleSubmitInjection(message) {
        if (this.environment !== "prototype") return;

        let { response, id } = await this.chairInterjection(
            message.text.replace("[DATE]", message.date),
            message.index,
            message.length,
            true
        );

        let summary = {
            id: id,
            speaker: this.conversationOptions.characters[0].id,
            text: response,
            type: "interjection",
        };

        this.conversation.push(summary);

        this.socket.emit("conversation_update", this.conversation);
        console.log(`[meeting ${this.meetingId}] interjection generated on index ${this.conversation.length - 1}`);

        summary.sentences = splitSentences(response);
        this.generateAudio(summary, this.conversationOptions.characters[0]);
    }

    async handleRaiseHand(handRaisedOptions) {
        console.log(`[meeting ${this.meetingId}] hand raised on index ${handRaisedOptions.index - 1}`);
        this.handRaised = true;
        this.conversationOptions.state.humanName = handRaisedOptions.humanName;

        // Cut everything after the raised index
        this.conversation = this.conversation.slice(0, handRaisedOptions.index);

        if (!this.conversationOptions.state.alreadyInvited) {
            let { response, id } = await this.chairInterjection(
                this.conversationOptions.options.raiseHandPrompt[this.conversationOptions.language].replace(
                    "[NAME]",
                    this.conversationOptions.state.humanName
                ),
                handRaisedOptions.index,
                this.conversationOptions.options.raiseHandInvitationLength
            );

            const firstNewLineIndex = response.indexOf("\n\n");
            if (firstNewLineIndex !== -1) {
                response = response.substring(0, firstNewLineIndex);
            }

            const message = {
                id: id,
                speaker: this.conversationOptions.characters[0].id,
                text: response,
                type: "invitation",
                message_index: handRaisedOptions.index,
            }

            this.conversation.push(message);
            message.sentences = splitSentences(response);

            this.conversationOptions.state.alreadyInvited = true;
            console.log(`[meeting ${this.meetingId}] invitation generated, on index ${handRaisedOptions.index}`);

            this.audioSystem.queueAudioGeneration(
                message,
                this.conversationOptions.characters[0],
                this.conversationOptions.options,
                this.meetingId,
                this.environment
            );
        }

        this.conversation.push({
            type: 'awaiting_human_question',
            speaker: this.conversationOptions.state.humanName
        });

        console.log(`[meeting ${this.meetingId}] awaiting human question on index ${this.conversation.length - 1}`);

        this.services.meetingsCollection.updateOne(
            { _id: this.meetingId },
            { $set: { conversation: this.conversation, 'options.state': this.conversationOptions.state } }
        );

        this.socket.emit("conversation_update", this.conversation);
    }

    async chairInterjection(interjectionPrompt, index, length, dontStop) {
        try {
            const chair = this.conversationOptions.characters[0];
            let messages = this.buildMessageStack(chair, index);

            messages.push({
                role: "system",
                content: interjectionPrompt,
            });

            const openai = this.services.getOpenAI();
            const completion = await openai.chat.completions.create({
                model: this.conversationOptions.options.gptModel,
                max_completion_tokens: length,
                temperature: this.conversationOptions.options.temperature,
                frequency_penalty: this.conversationOptions.options.frequencyPenalty,
                presence_penalty: this.conversationOptions.options.presencePenalty,
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
            this.socket.emit("conversation_error", {
                message: "An error occurred during the conversation.",
                code: 500,
            });
            reportError(error);
            return { response: "", id: null };
        }
    }

    buildMessageStack(speaker, upToIndex) {
        let messages = [];

        messages.push({
            role: "system",
            content: `${this.conversationOptions.topic}\n\n${speaker.prompt}`.trim(),
        });

        for (const msg of this.conversation) {
            if (msg.type === "skipped") continue;
            // Fix for humanName being potentially undefined if state not set?
            // original: const speakerName = msg.type === 'human' ? conversationOptions.humanName : ...
            // In original conversationOptions.humanName was likely set on root, but here it seems to be in `state`.
            // Let's assume it works as previous.
            const speakerName = msg.type === 'human' ? (this.conversationOptions.state?.humanName || "Human") : (this.conversationOptions.characters.find(c => c.id === msg.speaker)?.name || "Unknown");
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

    handleSubmitHumanMessage(message) {
        console.log(`[meeting ${this.meetingId}] human input on index ${this.conversation.length - 1}`);

        if (this.conversation[this.conversation.length - 1].type !== 'awaiting_human_question') {
            // throw new Error("Received a human question but was not expecting one!");
            // Better to log error and ignore to prevent crash?
            console.error("Received a human question but was not expecting one!");
            return;
        }
        this.conversation.pop();

        if (this.conversation[this.conversation.length - 1].type === 'invitation') {
            console.log(`[meeting ${this.meetingId}] popping invitation down to index ${this.conversation.length - 1}`);
            this.conversation.pop();
        }

        if (message.askParticular) {
            console.log(`[meeting ${this.meetingId}] specifically asked to ${message.askParticular}`);
            message.text = message.speaker + " asked " + message.askParticular + ":\xa0" + message.text;
        } else {
            message.text = message.speaker + (this.conversationOptions.language === 'en' ? " said:\xa0" : " sa:\xa0") + message.text;
        }

        message.id = "human-" + uuidv4();
        message.type = "human";
        message.speaker = this.conversationOptions.state.humanName;

        this.conversation.push(message);

        this.services.meetingsCollection.updateOne(
            { _id: this.meetingId },
            { $set: { conversation: this.conversation } }
        );

        this.socket.emit("conversation_update", this.conversation);

        message.sentences = splitSentences(message.text);
        this.audioSystem.queueAudioGeneration(
            message,
            this.conversationOptions.characters[0],
            this.conversationOptions.options,
            this.meetingId,
            this.environment
        );

        this.isPaused = false;
        this.handRaised = false;
        this.startLoop();
    }

    handleSubmitHumanPanelist(message) {
        console.log(`[meeting ${this.meetingId}] human panelist ${message.speaker} on index ${this.conversation.length - 1}`);

        if (this.conversation[this.conversation.length - 1].type !== 'awaiting_human_panelist') {
            console.error("Received a human panelist but was not expecting one!");
            return;
        }
        this.conversation.pop();

        const charName = this.conversationOptions.characters.find(c => c.id === message.speaker)?.name || "Unknown";
        message.text = charName + (this.conversationOptions.language === 'en' ? " said:\xa0" : " sa:\xa0") + message.text;
        message.id = message.speaker + uuidv4();
        message.type = "panelist";

        this.conversation.push(message);

        this.services.meetingsCollection.updateOne(
            { _id: this.meetingId },
            { $set: { conversation: this.conversation } }
        );

        this.socket.emit("conversation_update", this.conversation);

        message.sentences = splitSentences(message.text);
        this.audioSystem.queueAudioGeneration(
            message,
            this.conversationOptions.characters[0],
            this.conversationOptions.options,
            this.meetingId,
            this.environment
        );

        this.isPaused = false;
        this.handRaised = false;
        this.startLoop();
    }

    async handleWrapUpMeeting(message) {
        const summaryPrompt = this.conversationOptions.options.finalizeMeetingPrompt[this.conversationOptions.language].replace("[DATE]", message.date);

        let { response, id } = await this.chairInterjection(
            summaryPrompt,
            this.conversation.length,
            this.conversationOptions.options.finalizeMeetingLength,
            true
        );

        let summary = {
            id: id,
            speaker: this.conversationOptions.characters[0].id,
            text: response,
            type: "summary",
        };

        this.conversation.push(summary);

        this.socket.emit("conversation_update", this.conversation);
        console.log(`[meeting ${this.meetingId}] summary generated on index ${this.conversation.length - 1}`);

        this.services.meetingsCollection.updateOne(
            { _id: this.meetingId },
            { $set: { conversation: this.conversation, summary: summary } }
        );

        summary.sentences = splitSentences(response);
        this.generateAudio(summary, this.conversationOptions.characters[0], true);
    }

    async handleReconnection(options) {
        console.log(`[meeting ${options.meetingId}] attempting to resume`);
        try {
            const existingMeeting = await this.services.meetingsCollection.findOne({
                _id: options.meetingId, // Note: ensure ID types match (string vs int). In original it used whatever was passed.
            });

            // Original used Int for meeting_id seq.
            // options.meetingId comes from client. 
            // If client sends string but DB needs integer, we might need conversion?
            // Original: const existingMeeting = await this.services.meetingsCollection.findOne({ _id: options.meetingId });
            // It seems consistent in original.

            if (existingMeeting) {
                this.meetingId = existingMeeting._id;
                this.conversation = existingMeeting.conversation;
                this.conversationOptions = existingMeeting.options;
                this.meetingDate = new Date(existingMeeting.date);
                this.handRaised = options.handRaised;
                this.extraMessageCount =
                    options.conversationMaxLength -
                    this.conversationOptions.options.conversationMaxLength;

                // Missing audio regen logic
                let missingAudio = [];
                for (let i = 0; i < this.conversation.length; i++) {
                    if (this.conversation[i].type === 'awaiting_human_panelist') continue;
                    if (this.conversation[i].type === 'awaiting_human_question') continue;
                    if (existingMeeting.audio.indexOf(this.conversation[i].id) === -1) {
                        missingAudio.push(this.conversation[i]);
                    }
                }
                // ... (Loop for regen) ... 
                for (let i = 0; i < missingAudio.length; i++) {
                    console.log(`[meeting ${this.meetingId}] (async) generating missing audio for ${missingAudio[i].speaker}`);
                    missingAudio[i].sentences = splitSentences(missingAudio[i].text);
                    this.audioSystem.queueAudioGeneration(
                        missingAudio[i],
                        this.conversationOptions.characters.find(c => c.id == missingAudio[i].speaker),
                        this.conversationOptions.options,
                        this.meetingId,
                        this.environment
                    );
                }

                console.log(`[meeting ${this.meetingId}] resumed`);
                this.socket.emit("conversation_update", this.conversation); // Immediate sync
                this.startLoop();
            } else {
                this.socket.emit("meeting_not_found", { meeting_id: options.meetingId });
                console.log(`[meeting ${options.meetingId}] not found`);
            }
        } catch (error) {
            console.error("Error resuming conversation:", error);
            this.socket.emit("conversation_error", { message: "Error resuming", code: 500 });
            reportError(error);
        }
    }

    async handleStartConversation(setup) {
        this.conversationOptions = setup;
        if (this.environment === "prototype") {
            this.conversationOptions.options = setup.options ?? this.globalOptions;
        } else {
            this.conversationOptions.options = this.globalOptions;
        }

        this.conversation = [];
        this.currentSpeaker = 0;
        this.extraMessageCount = 0;
        this.isPaused = false;
        this.handRaised = false;
        this.meetingDate = new Date();

        this.conversationOptions.state = {
            alreadyInvited: false
        };

        const storeResult = await this.services.insertMeeting({
            options: this.conversationOptions,
            audio: [],
            conversation: [],
            date: this.meetingDate.toISOString(),
        });

        this.meetingId = storeResult.insertedId;

        this.socket.emit("meeting_started", { meeting_id: this.meetingId });
        console.log(`[session ${this.socket.id} meeting ${this.meetingId}] started`);
        this.startLoop();
    }

    async runLoop() {
        while (this.run) {
            if (this.isPaused || this.handRaised) {
                // Wait a bit before checking again? Or just return and let events trigger logic?
                // Events (resume, continue) trigger proper actions.
                // If we are in a persistent loop, we should ideally wait on a signal.
                // However, the original code called handleConversationTurn() from events.
                // Let's stick to the event-driven trigger for loop resumption if we break the loop.
                // OR: We simply return if paused, and resume_conversation calls runLoop again.
                // That seems safest and matches original event-driven 'recursion'.
                return;
            }

            // Check max length
            if (this.conversation.length >= this.conversationOptions.options.conversationMaxLength + this.extraMessageCount) {
                return;
            }

            // Check awaiting states
            if (this.conversation.length > 0 &&
                (this.conversation[this.conversation.length - 1].type === 'awaiting_human_panelist' ||
                    this.conversation[this.conversation.length - 1].type === 'awaiting_human_question')) {
                return;
            }

            await this.processTurn();

            // If processTurn resulted in a state change (pause, hand raise, end), the next iteration check handles it (or we return).
        }
    }

    // Explicit method to start/resume the loop
    startLoop() {
        // Prevent multiple concurrent loops if called multiple times?
        // We can add a flag 'isLoopRunning' but given single-threaded nature + async await, 
        this.runLoop();
    }

    decideNextAction() {
        // 1. Check Limits
        if (this.conversation.length >= this.conversationOptions.options.conversationMaxLength + this.extraMessageCount) {
            return { type: 'END_CONVERSATION' };
        }

        // 2. Check Awaiting States
        if (this.conversation.length > 0) {
            const lastMsg = this.conversation[this.conversation.length - 1];
            if (lastMsg.type === 'awaiting_human_panelist' || lastMsg.type === 'awaiting_human_question') {
                return { type: 'WAIT' };
            }
        }

        // 3. Determine Speaker
        const nextSpeakerIndex = this.calculateCurrentSpeaker();
        const nextSpeaker = this.conversationOptions.characters[nextSpeakerIndex];

        // 4. Panelist Turn
        if (nextSpeaker.type === 'panelist') {
            return { type: 'REQUEST_PANELIST', speaker: nextSpeaker };
        }

        // 5. AI Turn
        return { type: 'GENERATE_AI_RESPONSE', speaker: nextSpeaker };
    }

    async processTurn() {
        try {
            const thisMeetingId = this.meetingId;

            // Decoupled Decision Step
            const action = this.decideNextAction();

            switch (action.type) {
                case 'WAIT':
                    return; // Do nothing, just wait.

                case 'END_CONVERSATION':
                    this.socket.emit("conversation_end", this.conversation);
                    return;

                case 'REQUEST_PANELIST':
                    this.conversation.push({
                        type: 'awaiting_human_panelist',
                        speaker: action.speaker.id
                    });
                    console.log(`[meeting ${this.meetingId}] awaiting human panelist on index ${this.conversation.length - 1}`);
                    this.socket.emit("conversation_update", this.conversation);
                    this.services.meetingsCollection.updateOne(
                        { _id: this.meetingId },
                        { $set: { conversation: this.conversation } }
                    );
                    return;

                case 'GENERATE_AI_RESPONSE':
                    this.currentSpeaker = this.conversationOptions.characters.findIndex(c => c.id === action.speaker.id);
                    // Generate Logic
                    let attempt = 1;
                    let output = { response: "" };
                    while (attempt < 5 && output.response === "") {
                        output = await this.generateTextFromGPT(action.speaker);

                        if (!this.run || this.handRaised || this.isPaused) return;
                        if (thisMeetingId != this.meetingId) return;
                        attempt++;
                        if (output.response === "") {
                            console.log(`[meeting ${this.meetingId}] entire message trimmed, trying again. attempt ${attempt}`);
                        }
                    }

                    let message = {
                        id: output.id,
                        speaker: action.speaker.id,
                        text: output.response,
                        sentences: output.sentences,
                        trimmed: output.trimmed,
                        pretrimmed: output.pretrimmed,
                    };

                    if (this.conversation.length > 1 && this.conversation[this.conversation.length - 1].type === "human" && this.conversation[this.conversation.length - 1].askParticular === message.speaker) {
                        message.type = "response";
                    }

                    if (message.text === "") {
                        message.type = "skipped";
                        console.warn(`[meeting ${this.meetingId}] failed to make a message. Skipping speaker ${action.speaker.id}`);
                    }

                    this.conversation.push(message);
                    const message_index = this.conversation.length - 1;

                    // Save to DB *before* emitting to ensure consistency
                    await this.services.meetingsCollection.updateOne(
                        { _id: this.meetingId },
                        { $set: { conversation: this.conversation } }
                    );

                    this.socket.emit("conversation_update", this.conversation);
                    console.log(`[meeting ${this.meetingId}] message generated, index ${message_index}, speaker ${message.speaker}`);

                    // Queue audio generation
                    this.audioSystem.queueAudioGeneration(
                        message,
                        action.speaker,
                        this.conversationOptions.options,
                        this.meetingId,
                        this.environment
                    );
                    break;
            }
        } catch (error) {
            console.error("Error during conversation:", error);
            this.socket.emit("conversation_error", { message: "Error", code: 500 });
            reportError(error);
        }
    }

    async generateTextFromGPT(speaker) {
        // Needs to access openai
        // Needs this.conversationOptions
        try {
            const messages = this.buildMessageStack(speaker);
            const openai = this.services.getOpenAI();

            const completion = await openai.chat.completions.create({
                model: this.conversationOptions.options.gptModel,
                max_completion_tokens:
                    speaker.id === this.conversationOptions.options.chairId
                        ? this.conversationOptions.options.chairMaxTokens
                        : this.conversationOptions.options.maxTokens,
                temperature: this.conversationOptions.options.temperature,
                frequency_penalty: this.conversationOptions.options.frequencyPenalty,
                presence_penalty: this.conversationOptions.options.presencePenalty,
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
                if (this.conversationOptions.options.trimSentance) {
                    const lastPeriodIndex = response.lastIndexOf(".");
                    if (lastPeriodIndex !== -1) {
                        trimmedContent = originalResponse.substring(lastPeriodIndex + 1);
                        response = response.substring(0, lastPeriodIndex + 1);
                    }
                }

                if (this.conversationOptions.options.trimParagraph) {
                    const lastNewLineIndex = response.lastIndexOf("\n\n");
                    if (lastNewLineIndex !== -1) {
                        trimmedContent = originalResponse.substring(lastNewLineIndex);
                        response = response.substring(0, lastNewLineIndex);
                    }
                }
            }

            // Check others speaking
            for (var i = 0; i < this.conversationOptions.characters.length; i++) {
                if (i === this.currentSpeaker) continue;
                const nameIndex = response.indexOf(this.conversationOptions.characters[i].name + ":");
                if (nameIndex != -1 && nameIndex < 20) {
                    response = response.substring(0, nameIndex).trim();
                    trimmedContent = originalResponse.substring(nameIndex);
                }
            }

            let sentences = splitSentences(response);

            if (completion.choices[0].finish_reason != "stop") {
                // Check if we can re-add some messages from the end, to put back some of the list of questions that chair often produces
                if (this.conversationOptions.options.trimChairSemicolon) {
                    if (speaker.id === this.conversationOptions.options.chairId) {

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

    async handleWrapUpMeeting(message) {
        if (this.conversationOptions.options.skipAudio) return;

        if (message.type === "skipped") {
            this.socket.emit("audio_update", { id: message.id, type: "skipped" });
            return;
        }

        let buffer;
        let generateNew = true;
        try {
            const existingAudio = await this.services.audioCollection.findOne({ _id: message.id });
            if (existingAudio) {
                buffer = existingAudio.buffer;
                generateNew = false;
            }
        } catch (e) { console.log(e); }

        try {
            const openai = this.services.getOpenAI();
            if (generateNew) {
                const mp3 = await openai.audio.speech.create({
                    model: this.conversationOptions.options.voiceModel,
                    voice: speaker.voice,
                    speed: this.conversationOptions.options.audio_speed,
                    input: message.text.substring(0, 4096),
                });
                buffer = Buffer.from(await mp3.arrayBuffer());
            }

            const sentencesWithTimings = skipMatching ? [] : await this.getSentenceTimings(buffer, message);

            const audioObject = {
                id: message.id,
                audio: buffer,
                sentences: sentencesWithTimings
            };

            this.socket.emit("audio_update", audioObject);

            if (generateNew && this.environment !== "prototype") {
                // Upsert logic
                await this.services.audioCollection.updateOne(
                    { _id: audioObject.id },
                    {
                        $set: {
                            date: new Date().toISOString(),
                            meeting_id: this.meetingId,
                            audio: buffer,
                            sentences: sentencesWithTimings
                        }
                    },
                    { upsert: true }
                );
            }
            if (this.environment !== "prototype") {
                await this.services.meetingsCollection.updateOne(
                    { _id: this.meetingId },
                    { $addToSet: { audio: audioObject.id } }
                );
            }

        } catch (error) {
            console.error("Error generating audio:", error);
            reportError(error);
        }
    }

    async getSentenceTimings(buffer, message) {
        const openai = getOpenAI();
        const audioFile = new File([buffer], "speech.mp3", { type: "audio/mpeg" });
        const transcription = await openai.audio.transcriptions.create({
            file: audioFile,
            model: "whisper-1",
            response_format: "verbose_json",
            timestamp_granularities: ["word"]
        });
        return mapSentencesToWords(message.sentences, transcription.words);
    }

    async handleRequestClientKey() {
        console.log(`[meeting ${this.meetingId}] clientkey requested`);
        try {
            const sessionConfig = JSON.stringify({
                session: {
                    "type": "transcription",
                    "audio": {
                        "input": {
                            "format": {
                                "type": "audio/pcm",
                                "rate": 24000
                            },
                            "noise_reduction": {
                                "type": "near_field"
                            },
                            "transcription": {
                                "model": this.conversationOptions.options.transcribeModel,
                                "prompt": this.conversationOptions.options.transcribePrompt[this.conversationOptions.language],
                                "language": this.conversationOptions.language
                            },
                            "turn_detection": {
                                "type": "server_vad",
                                "threshold": 0.5,
                                "prefix_padding_ms": 300,
                                "silence_duration_ms": 500
                            }
                        }
                    }
                }
            });

            const openai = this.services.getOpenAI();
            const response = await fetch(
                "https://api.openai.com/v1/realtime/client_secrets",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${openai.apiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: sessionConfig,
                }
            );

            const data = await response.json();
            this.socket.emit("clientkey_response", data);
            console.log(`[meeting ${this.meetingId}] clientkey sent`);
        } catch (error) {
            console.error("Error during conversation:", error);
            this.socket.emit(
                "conversation_error",
                {
                    message: "An error occurred during the conversation.",
                    code: 500
                }
            );
            reportError(error);
        }
    }

}
