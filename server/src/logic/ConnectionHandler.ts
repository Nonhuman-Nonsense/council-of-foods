import type { ReconnectionOptions } from "@shared/SocketTypes.js";
import type { ConversationMessage } from "@shared/ModelTypes.js";
import type { IMeetingManager } from "@interfaces/MeetingInterfaces.js";
import { splitSentences } from "@utils/textUtils.js";
import { reportError, reportWarning } from "@utils/errorbot.js";
import { Logger } from "@utils/Logger.js";

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
                manager.broadcaster.broadcastConversationUpdate(manager.conversation);
                manager.startLoop();
            } else {
                //TODO: implement a special not found?
                // manager.broadcaster.broadcastMeetingNotFound(String(options.meetingId));

                manager.broadcaster.broadcastError('Meeting not found', 404);
                reportWarning(`meeting ${options.meetingId}`, `Meeting not found`);
            }
        } catch (error) {
            manager.broadcaster.broadcastError("Error resuming", 500);
            reportError(`meeting ${options.meetingId}`, "Error resuming conversation", error);
        }
    }
}
