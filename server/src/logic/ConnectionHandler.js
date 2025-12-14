import { splitSentences } from "../utils/textUtils.js";
import { reportError } from "../../errorbot.js";

/**
 * Manages socket connection events (disconnect, reconnect).
 * Responsible for cleaning up running states on disconnect and restoring
 * full meeting state (including verifying missed audio) on reconnection.
 */
export class ConnectionHandler {
    /**
     * @param {import('./MeetingManager').MeetingManager} meetingManager 
     */
    constructor(meetingManager) {
        this.manager = meetingManager;
    }

    /**
     * Handles 'disconnect' event.
     * Sets manager.run to false to terminate the run loop.
     */
    handleDisconnect() {
        const { manager } = this;
        console.log(`[session ${manager.socket.id} meeting ${manager.meetingId}] disconnected`);
        manager.run = false;
    }

    /**
     * Handles 'attempt_reconnection' event.
     * Retrieves meeting state from DB, restores manager context, 
     * identifies missing audio for existing text, and resumes the loop.
     * 
     * @param {object} options 
     * @param {string} options.meetingId - The ID of the meeting to restore.
     * @param {boolean} options.handRaised - Client-side flag if hand was raised.
     * @param {number} options.conversationMaxLength
     */
    async handleReconnection(options) {
        const { manager } = this;
        console.log(`[meeting ${options.meetingId}] attempting to resume`);
        try {
            const existingMeeting = await manager.services.meetingsCollection.findOne({
                _id: options.meetingId,
            });

            if (existingMeeting) {
                manager.meetingId = existingMeeting._id;
                manager.conversation = existingMeeting.conversation;
                manager.conversationOptions = existingMeeting.options;
                manager.meetingDate = new Date(existingMeeting.date);
                manager.handRaised = options.handRaised;
                manager.extraMessageCount =
                    options.conversationMaxLength -
                    manager.conversationOptions.options.conversationMaxLength;

                // Missing audio regen logic
                let missingAudio = [];
                for (let i = 0; i < manager.conversation.length; i++) {
                    if (manager.conversation[i].type === 'awaiting_human_panelist') continue;
                    if (manager.conversation[i].type === 'awaiting_human_question') continue;
                    if (existingMeeting.audio.indexOf(manager.conversation[i].id) === -1) {
                        missingAudio.push(manager.conversation[i]);
                    }
                }

                for (let i = 0; i < missingAudio.length; i++) {
                    console.log(`[meeting ${manager.meetingId}] (async) generating missing audio for ${missingAudio[i].speaker}`);
                    missingAudio[i].sentences = splitSentences(missingAudio[i].text);
                    // Ensure speaker is found
                    const speaker = manager.conversationOptions.characters.find(c => c.id == missingAudio[i].speaker);
                    if (speaker) {
                        manager.audioSystem.queueAudioGeneration(
                            missingAudio[i],
                            speaker,
                            manager.conversationOptions.options,
                            manager.meetingId,
                            manager.environment
                        );
                    }
                }

                console.log(`[meeting ${manager.meetingId}] resumed`);
                manager.socket.emit("conversation_update", manager.conversation);
                manager.startLoop();
            } else {
                manager.socket.emit("meeting_not_found", { meeting_id: options.meetingId });
                console.log(`[meeting ${options.meetingId}] not found`);
            }
        } catch (error) {
            console.error("Error resuming conversation:", error);
            manager.socket.emit("conversation_error", { message: "Error resuming", code: 500 });
            reportError(error);
        }
    }
}
