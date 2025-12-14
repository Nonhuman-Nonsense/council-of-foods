import { splitSentences } from "../utils/textUtils.js";
import { reportError } from "../../errorbot.js";

export class MeetingLifecycleHandler {
    constructor(meetingManager) {
        this.manager = meetingManager;
    }

    async handleStartConversation(setup) {
        const { manager } = this;
        manager.conversationOptions = setup;
        if (manager.environment === "prototype") {
            manager.conversationOptions.options = { ...manager.globalOptions, ...(setup.options || {}) };
        } else {
            manager.conversationOptions.options = manager.globalOptions;
        }

        manager.conversation = [];
        manager.currentSpeaker = 0;
        manager.extraMessageCount = 0;
        manager.isPaused = false;
        manager.handRaised = false;
        manager.meetingDate = new Date();

        manager.conversationOptions.state = {
            alreadyInvited: false
        };

        const storeResult = await manager.services.insertMeeting({
            options: manager.conversationOptions,
            audio: [],
            conversation: [],
            date: manager.meetingDate.toISOString(),
        });

        manager.meetingId = storeResult.insertedId;

        manager.socket.emit("meeting_started", { meeting_id: manager.meetingId });
        console.log(`[session ${manager.socket.id} meeting ${manager.meetingId}] started`);
        manager.startLoop();
    }



    async handleWrapUpMeeting(message) {
        const { manager } = this;
        console.log(`[meeting ${manager.meetingId}] attempting to wrap up`);
        const summaryPrompt = manager.conversationOptions.options.finalizeMeetingPrompt[manager.conversationOptions.language].replace("[DATE]", message.date);

        // Note: chairInterjection is on manager (delegated to DialogGenerator)
        // Note: chairInterjection is on manager (delegated to DialogGenerator)
        let { response, id } = await manager.dialogGenerator.chairInterjection(
            summaryPrompt,
            manager.conversation.length,
            manager.conversationOptions.options.finalizeMeetingLength,
            true,
            manager.conversation,
            manager.conversationOptions,
            manager.socket
        );

        let summary = {
            id: id,
            speaker: manager.conversationOptions.characters[0].id,
            text: response,
            type: "summary",
        };

        manager.conversation.push(summary);

        manager.socket.emit("conversation_update", manager.conversation);
        console.log(`[meeting ${manager.meetingId}] summary generated on index ${manager.conversation.length - 1}`);

        manager.services.meetingsCollection.updateOne(
            { _id: manager.meetingId },
            { $set: { conversation: manager.conversation, summary: summary } }
        );

        summary.sentences = splitSentences(response);
        await manager.audioSystem.generateAudio(
            summary,
            manager.conversationOptions.characters[0],
            manager.conversationOptions.options,
            manager.meetingId,
            manager.environment,
            true
        );
    }

    async handleRequestClientKey() {
        const { manager } = this;
        console.log(`[meeting ${manager.meetingId}] clientkey requested`);
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
                                "model": manager.conversationOptions.options.transcribeModel,
                                "prompt": manager.conversationOptions.options.transcribePrompt[manager.conversationOptions.language],
                                "language": manager.conversationOptions.language
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

            const openai = manager.services.getOpenAI();
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
            manager.socket.emit("clientkey_response", data);
            console.log(`[meeting ${manager.meetingId}] clientkey sent`);
        } catch (error) {
            console.error("Error during conversation:", error);
            manager.socket.emit(
                "conversation_error",
                {
                    message: "An error occurred during the conversation.",
                    code: 500
                }
            );
            reportError(error);
        }
    }

    handleContinueConversation() {
        const { manager } = this;
        console.log(`[meeting ${manager.meetingId}] continuing conversation`);
        manager.extraMessageCount += manager.globalOptions.extraMessageCount;
        manager.startLoop();
    }
}
