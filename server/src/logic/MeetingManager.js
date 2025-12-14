import { v4 as uuidv4 } from "uuid";
import { getOpenAI } from "../services/OpenAIService.js";
import { meetingsCollection, audioCollection, insertMeeting } from "../services/DbService.js";
import { splitSentences } from "../utils/textUtils.js";
import { reportError } from "../../errorbot.js";
import defaultGlobalOptions from "../../global-options.json" with { type: 'json' };
import e2eOptions from "../../e2e-options.json" with { type: 'json' };
import { AudioSystem } from "./AudioSystem.js";
import { SpeakerSelector } from "./SpeakerSelector.js";
import { DialogGenerator } from "./DialogGenerator.js";
import { HumanInputHandler } from "./HumanInputHandler.js";
import { HandRaisingHandler } from "./HandRaisingHandler.js";
import { MeetingLifecycleHandler } from "./MeetingLifecycleHandler.js";

export class MeetingManager {
    constructor(socket, environment, optionsOverride = null, services = {}) {
        this.socket = socket;
        this.environment = environment;
        this.globalOptions = optionsOverride || (environment === 'test' ? e2eOptions : defaultGlobalOptions);

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
        this.dialogGenerator = new DialogGenerator(this.services, this.globalOptions);
        this.humanInputHandler = new HumanInputHandler(this);
        this.handRaisingHandler = new HandRaisingHandler(this);
        this.meetingLifecycleHandler = new MeetingLifecycleHandler(this);

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

        this.socket.on("start_conversation", async (setup) => this.meetingLifecycleHandler.handleStartConversation(setup));

        this.socket.on("disconnect", () => {
            console.log(`[session ${this.socket.id} meeting ${this.meetingId}] disconnected`);
            this.run = false;
        });



        // Use handlers
        this.socket.on("submit_human_message", (msg) => this.humanInputHandler.handleSubmitHumanMessage(msg));
        this.socket.on("submit_human_panelist", (msg) => this.humanInputHandler.handleSubmitHumanPanelist(msg));
        this.socket.on("submit_injection", (msg) => this.humanInputHandler.handleSubmitInjection(msg));
        this.socket.on("raise_hand", (msg) => this.handRaisingHandler.handleRaiseHand(msg));
        this.socket.on("wrap_up_meeting", (msg) => this.meetingLifecycleHandler.handleWrapUpMeeting(msg));
        this.socket.on('attempt_reconnection', (options) => this.meetingLifecycleHandler.handleReconnection(options));
        this.socket.on('continue_conversation', () => this.meetingLifecycleHandler.handleContinueConversation());
        this.socket.on('request_clientkey', async () => this.meetingLifecycleHandler.handleRequestClientKey());
    }

    setupPrototypeListeners() {
        if (this.environment !== 'prototype') return;

        this.socket.on("pause_conversation", (msg) => {
            console.log(`[meeting ${this.meetingId}] paused`);
            this.isPaused = true;
        });

        this.socket.on("resume_conversation", (msg) => {
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
        return SpeakerSelector.calculateNextSpeaker(this.conversation, this.conversationOptions.characters);
    }



    async chairInterjection(interjectionPrompt, index, length, dontStop) {
        return this.dialogGenerator.chairInterjection(
            interjectionPrompt,
            index,
            length,
            dontStop,
            this.conversation,
            this.conversationOptions,
            this.socket
        );
    }

    // buildMessageStack is now handled by DialogGenerator, removing from here unless needed for debugging, 
    // but generateTextFromGPT uses it internally in DialogGenerator. 
    // Wait, is it used elsewhere? Checked usages: generateTextFromGPT and chairInterjection.
    // So we can remove it entirely.



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
        return this.dialogGenerator.generateTextFromGPT(
            speaker,
            this.conversation,
            this.conversationOptions,
            this.currentSpeaker
        );
    }



}
