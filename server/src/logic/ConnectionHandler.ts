import type { ReconnectionOptions } from "@shared/SocketTypes.js";
import type { Message } from "@shared/ModelTypes.js";
import type { IMeetingManager } from "@interfaces/MeetingInterfaces.js";
import type { StoredMeeting } from "@models/DBModels.js";
import { splitSentences } from "@shared/textUtils.js";
import { ForbiddenError, NotFoundError } from "@models/Errors.js";
import { Logger } from "@utils/Logger.js";
import { promoteMeetingCompleteIfReady } from "@logic/MeetingLifecycleHandler.js";

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
        manager.isActive = false;
    }

    /**
     * Handles 'attempt_reconnection' event.
     * Retrieves meeting state from DB, restores manager context, 
     * identifies missing audio for existing text, and resumes the loop.
     */
    async handleReconnection(options: ReconnectionOptions): Promise<boolean> {
        const { manager } = this;

        Logger.info(`meeting ${options.meetingId}`, "attempting to resume");
        try {
            const meetingIdNum = Number(options.meetingId);
            const existingMeeting = await manager.services.meetingsCollection.findOne({
                _id: meetingIdNum,
            });

            if (!existingMeeting) {
                manager.broadcaster.broadcastError(new NotFoundError());
                Logger.warn("meeting", `Meeting not found`, {
                    from: { meetingId: options.meetingId, socketId: manager.socket.id },
                });
                return false;
            }

            if (existingMeeting.liveKey !== options.liveKey) {
                manager.broadcaster.broadcastError(new ForbiddenError());
                Logger.warn("meeting", "attempt_reconnection liveKey mismatch", {
                    from: { meetingId: options.meetingId, socketId: manager.socket.id },
                });
                return false;
            }

            manager.meeting = existingMeeting as StoredMeeting;

            // A concluding/concluded meeting is finished: never carry in a stale raised hand,
            // which would otherwise stall the summary generation (decideNextAction's rule 0).
            const isConcluding = existingMeeting.conversation.some(
                (msg) => msg.type === 'summary_pending' || msg.type === 'summary'
            );
            manager.handRaised = isConcluding ? false : (options.handRaised ?? false);

            // TODO, check how the server stores extraMessageCount
            // const baseMax = manager.serverOptions.conversationMaxLength;
            // const clientMax = options.conversationMaxLength ?? baseMax;
            // manager.extraMessageCount = Math.max(0, clientMax - baseMax);

            // Missing audio regen logic
            const missingAudio: Message[] = [];
            for (let i = 0; i < existingMeeting.conversation.length; i++) {
                if (existingMeeting.conversation[i].type === 'awaiting_human_panelist') continue;
                if (existingMeeting.conversation[i].type === 'awaiting_human_question') continue;
                if (existingMeeting.conversation[i].type === 'query_extension') continue;
                if (existingMeeting.conversation[i].type === 'summary_pending') continue;
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

            manager.lastReconnectionAt = Date.now();
            Logger.info(`meeting ${manager.meeting._id}`, "resumed");
            manager.broadcaster.broadcastConversationUpdate(manager.meeting.conversation);

            // Simply ensure loop is running.
            // Idempotency in MeetingManager prevents double-start.
            manager.startLoop();

            // Heal a concluded-but-unpromoted meeting: if a crash landed after the summary was
            // written but before meetingComplete was set, the summary_pending marker is already
            // gone (a real summary is at the tail), so the loop won't re-run GENERATE_SUMMARY.
            // The missing summary audio was queued above; drain it, then re-run the promotion.
            const lastMsg = existingMeeting.conversation[existingMeeting.conversation.length - 1];
            if (lastMsg?.type === 'summary' && !existingMeeting.meetingComplete) {
                await manager.audioSystem.waitForIdle();
                await promoteMeetingCompleteIfReady(manager);
            }

            return true;
        } catch (error) {
            Logger.reportAndCrashClient("meeting", "Error resuming conversation", {
                error,
                from: manager,
                broadcaster: manager.broadcaster,
            });
        }
        return false;
    }
}
