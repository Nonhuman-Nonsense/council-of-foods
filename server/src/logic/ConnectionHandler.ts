import type { ReconnectionOptions } from "@shared/SocketTypes.js";
import type { Message } from "@shared/ModelTypes.js";
import type { IMeetingManager } from "@interfaces/MeetingInterfaces.js";
import type { StoredMeeting } from "@models/DBModels.js";
import { splitSentences } from "@utils/textUtils.js";
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
            Logger.info(`meeting ${manager.meeting?._id}`, `disconnected (session ${manager.socket.id})`);
        }
        manager.isLoopActive = false;
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
                // Check BEFORE overwriting state
                // We don't need isRunning check anymore with idempotent startLoop

                manager.meeting = existingMeeting as StoredMeeting;
                manager.handRaised = options.handRaised ?? false;

                const baseMax = manager.serverOptions.conversationMaxLength;
                const clientMax = options.conversationMaxLength ?? baseMax;
                manager.extraMessageCount = Math.max(0, clientMax - baseMax);

                // Missing audio regen logic
                let missingAudio: Message[] = [];
                for (let i = 0; i < existingMeeting.conversation.length; i++) {
                    if (existingMeeting.conversation[i].type === 'awaiting_human_panelist') continue;
                    if (existingMeeting.conversation[i].type === 'awaiting_human_question') continue;
                    const msgId = existingMeeting.conversation[i].id;
                    if (msgId && existingMeeting.audio.indexOf(msgId) === -1) {
                        missingAudio.push(existingMeeting.conversation[i]);
                    }
                }

                for (let i = 0; i < missingAudio.length; i++) {
                    const audioMsg = missingAudio[i];
                    if (!audioMsg.id || !audioMsg.text) continue; // Skip malformed methods

                    Logger.info(`meeting ${manager.meeting._id}`, `(async) generating missing audio for ${audioMsg.speaker}`);
                    audioMsg.sentences = splitSentences(audioMsg.text as string);
                    // Ensure speaker is found
                    const speaker = existingMeeting.characters.find(c => c.id === audioMsg.speaker);
                    if (speaker) {
                        manager.audioSystem.queueAudioGeneration(
                            { ...audioMsg, id: audioMsg.id!, text: audioMsg.text!, sentences: audioMsg.sentences! },
                            speaker,
                            manager.meeting,
                            manager.environment,
                            manager.serverOptions
                        );
                    }
                }

                Logger.info(`meeting ${manager.meeting._id}`, "resumed");
                manager.broadcaster.broadcastConversationUpdate(manager.meeting.conversation);

                // Simply ensure loop is running. 
                // Idempotency in MeetingManager prevents double-start.
                manager.startLoop();
            } else {
                manager.broadcaster.broadcastError('Meeting not found', 404);
                Logger.warn(`meeting ${options.meetingId}`, `Meeting not found`);
            }
        } catch (error) {
            Logger.reportAndCrashClient(`meeting ${options.meetingId}`, "Error resuming conversation", error, manager.broadcaster);
        }
    }
}
