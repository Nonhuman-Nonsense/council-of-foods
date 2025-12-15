import { splitSentences } from "../utils/textUtils.js";
import { reportError } from "../../errorbot.js";
import { Logger } from "../utils/Logger.js";
import { Character, ConversationMessage } from "./SpeakerSelector.js";
import { GlobalOptions } from "./GlobalOptions.js";
import { Socket } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents, ReconnectionOptions } from "../models/SocketTypes.js";

import { IMeetingManager } from "../interfaces/MeetingInterfaces.js";


/**
 * Manages socket connection events (disconnect, reconnect).
 * Responsible for cleaning up running states on disconnect and restoring
 * full meeting state (including verifying missed audio) on reconnection.
 */
export class ConnectionHandler {
    manager: IMeetingManager;

    constructor(meetingManager: IMeetingManager) {
        this.manager = meetingManager;
    }

    /**
     * Handles 'disconnect' event.
     * Sets manager.run to false to terminate the run loop.
     */
    handleDisconnect(): void {
        const { manager } = this;
        // Check if socket is defined/connected before accessing property if needed, though 'id' should be there if it was connected
        if (manager.socket) {
            Logger.info(`meeting ${manager.meetingId}`, `disconnected (session ${manager.socket.id})`);
        }
        manager.run = false;
    }

    /**
     * Handles 'attempt_reconnection' event.
     * Retrieves meeting state from DB, restores manager context, 
     * identifies missing audio for existing text, and resumes the loop.
     */
    async handleReconnection(options: ReconnectionOptions): Promise<void> {
        const { manager } = this;
        Logger.info(`meeting ${options.meetingId}`, "attempting to resume");
        try {
            const meetingIdNum = Number(options.meetingId);
            const existingMeeting = await manager.services.meetingsCollection.findOne({
                _id: meetingIdNum,
            });

            if (existingMeeting) {
                manager.meetingId = existingMeeting._id;
                manager.conversation = existingMeeting.conversation;
                manager.conversationOptions = existingMeeting.options;
                manager.meetingDate = new Date(existingMeeting.date);
                manager.handRaised = options.handRaised ?? false;

                const clientMax = options.conversationMaxLength ?? manager.conversationOptions.options.conversationMaxLength;
                manager.extraMessageCount = clientMax - manager.conversationOptions.options.conversationMaxLength;

                // Missing audio regen logic
                let missingAudio: ConversationMessage[] = [];
                for (let i = 0; i < manager.conversation.length; i++) {
                    if (manager.conversation[i].type === 'awaiting_human_panelist') continue;
                    if (manager.conversation[i].type === 'awaiting_human_question') continue;
                    const msgId = manager.conversation[i].id;
                    if (msgId && existingMeeting.audio.indexOf(msgId) === -1) {
                        missingAudio.push(manager.conversation[i]);
                    }
                }

                for (let i = 0; i < missingAudio.length; i++) {
                    const audioMsg = missingAudio[i];
                    if (!audioMsg.id || !audioMsg.text) continue; // Skip malformed methods

                    Logger.info(`meeting ${manager.meetingId}`, `(async) generating missing audio for ${audioMsg.speaker}`);
                    audioMsg.sentences = splitSentences(audioMsg.text as string);
                    // Ensure speaker is found
                    const speaker = manager.conversationOptions.characters.find(c => c.id == audioMsg.speaker);
                    if (speaker) {
                        manager.audioSystem.queueAudioGeneration(
                            { ...audioMsg, id: audioMsg.id!, text: audioMsg.text!, sentences: audioMsg.sentences! },
                            speaker,
                            manager.conversationOptions.options,
                            manager.meetingId as number,
                            manager.environment
                        );
                    }
                }

                Logger.info(`meeting ${manager.meetingId}`, "resumed");
                manager.socket.emit("conversation_update", manager.conversation);
                manager.startLoop();
            } else {
                manager.socket.emit("meeting_not_found", { meeting_id: options.meetingId });
                Logger.warn(`meeting ${options.meetingId}`, "not found");
            }
        } catch (error) {
            // console.error("Error resuming conversation:", error);
            Logger.error(`meeting ${options.meetingId}`, "Error resuming conversation", error);
            manager.socket.emit("conversation_error", { message: "Error resuming", code: 500 });
            reportError(`meeting ${options.meetingId}`, "Reconnection Error", error);
        }
    }
}
