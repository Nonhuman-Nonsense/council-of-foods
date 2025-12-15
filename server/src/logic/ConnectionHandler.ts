import { splitSentences } from "../utils/textUtils.js";
import { reportError } from "../../errorbot.js";
import { Character, ConversationMessage } from "./SpeakerSelector.js";
import { GlobalOptions } from "./GlobalOptions.js";
import { Socket } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents } from "../models/SocketTypes.js";

// Local interface until MeetingManager is migrated
interface ConversationState {
    humanName?: string;
    alreadyInvited?: boolean;
    [key: string]: any;
}

interface ConversationOptions {
    state: ConversationState;
    language: string;
    options: GlobalOptions;
    characters: Character[];
}

interface IMeetingManager {
    meetingId: number | null;
    socket: Socket<ClientToServerEvents, ServerToClientEvents>;
    conversation: ConversationMessage[];
    conversationOptions: ConversationOptions;
    handRaised: boolean;
    isPaused: boolean;
    startLoop: () => void;
    dialogGenerator: any;
    audioSystem: any;
    services: any;
    environment: string;
    run: boolean;
    meetingDate: Date | null;
    extraMessageCount: number;
}

export interface ReconnectionOptions {
    meetingId: string | number; // Client might send string or number
    handRaised: boolean;
    conversationMaxLength: number;
}

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
        console.log(`[session ${manager.socket.id} meeting ${manager.meetingId}] disconnected`);
        manager.run = false;
    }

    /**
     * Handles 'attempt_reconnection' event.
     * Retrieves meeting state from DB, restores manager context, 
     * identifies missing audio for existing text, and resumes the loop.
     */
    async handleReconnection(options: ReconnectionOptions): Promise<void> {
        const { manager } = this;
        console.log(`[meeting ${options.meetingId}] attempting to resume`);
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
                manager.handRaised = options.handRaised;
                manager.extraMessageCount =
                    options.conversationMaxLength -
                    manager.conversationOptions.options.conversationMaxLength;

                // Missing audio regen logic
                let missingAudio: ConversationMessage[] = [];
                for (let i = 0; i < manager.conversation.length; i++) {
                    if (manager.conversation[i].type === 'awaiting_human_panelist') continue;
                    if (manager.conversation[i].type === 'awaiting_human_question') continue;
                    if (existingMeeting.audio.indexOf(manager.conversation[i].id) === -1) {
                        missingAudio.push(manager.conversation[i]);
                    }
                }

                for (let i = 0; i < missingAudio.length; i++) {
                    console.log(`[meeting ${manager.meetingId}] (async) generating missing audio for ${missingAudio[i].speaker}`);
                    missingAudio[i].sentences = splitSentences(missingAudio[i].text as string);
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
