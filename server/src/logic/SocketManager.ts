import { Socket } from "socket.io";
import { MeetingManager } from "./MeetingManager.js";
import { Logger } from "../utils/Logger.js";
import { ClientToServerEvents } from "@shared/SocketTypes.js";
import { reportError, reportWarning } from "../utils/errorbot.js";
import { ZodError } from "zod";

/**
 * SocketManager
 * 
 * Handles the "Connection Scope".
 * Maintains the WebSocket connection and manages the lifecycle of the active MeetingSession.
 * 
 * When a user connects, this manager is created.
 * When a user starts/reconnects to a meeting, this manager:
 * 1. Destroys the old MeetingSession (if any).
 * 2. Creates a new MeetingSession.
 * 3. Routes subsequent events to the active session.
 */
export class SocketManager {
    private socket: Socket;
    private environment: string;
    private currentSession: MeetingManager | null = null; // Using MeetingManager as the "Session" class

    constructor(socket: Socket, environment: string) {
        this.socket = socket;
        this.environment = environment;
        this.setupListeners();
    }

    private setupListeners() {
        this.socket.on("disconnect", () => {
            Logger.info("socket", `[${this.socket.id}] session disconnected`);
            this.destroySession();
        });

        // Lifecycle Events
        this.bindSafeListener("start_conversation", (payload) => this.handleStart(payload));
        this.bindSafeListener("attempt_reconnection", (payload) => this.handleReconnect(payload));

        // Proxy Events
        // We forward these to the active session if it exists.
        // Derived strictly from the shared interface to ensure type safety.
        // Excludes lifecycle events handled explicitly above.
        const proxyEvents: (keyof ClientToServerEvents)[] = [
            "submit_human_message",
            "submit_human_panelist",
            "pause_conversation",
            "resume_conversation",
            "remove_last_message",
            "submit_injection",
            "raise_hand",
            "wrap_up_meeting",
            "continue_conversation",
            "request_clientkey"
        ];

        for (const event of proxyEvents) {
            this.bindSafeListener(event, async (payload) => {
                // We can safely assert currentSession exists because requireSession=true
                await this.currentSession!.handleEvent(event, payload);
            }, true);
        }
    }

    /**
     * Helper to bind a socket event listener with standardized error handling.
     * Replaces the old 'respondTo' pattern.
     */
    private bindSafeListener(event: string, handler: (payload: any) => Promise<void>, requireSession: boolean = false) {
        this.socket.on(event, async (payload: any) => {
            if (requireSession && !this.currentSession) {
                // Safety Check:
                // 1. Lifecycle events (start/reconnect) set requireSession=false, so they bypass this.
                // 2. Proxy events (messages) set requireSession=true.
                // 3. If we get here, the client sent a message before the session was ready (e.g. race condition)
                //    or after it was destroyed. We drop it to prevent crashing.
                //    
                //    RECONNECTION/RACE CONDITION NOTE:
                //    In practice, TCP guarantees packet order. If a client sends "Reconnect" then "Message",
                //    the server processes "Reconnect" first (creating session), then "Message" (succeeds).
                //    This check primarily protects against "ghost" events from old sessions, buggy clients,
                //    or rare edge cases where the session might have crashed/reset in between events.
                reportWarning("socket", `Ignored event ${event} - No active session`);
                return;
            }

            try {
                await handler(payload);
            } catch (error: any) {
                // Report to external error service
                const context = this.currentSession?.meetingId
                    ? `meeting ${this.currentSession.meetingId}`
                    : `socket ${this.socket.id}`;

                if (error instanceof ZodError) {
                    reportWarning(context, `Validation Error for ${event}: ${error.message}`, error);

                    if (this.currentSession) {
                        this.currentSession.broadcaster.broadcastWarning("Invalid Input", 400, error);
                    } else {
                        this.socket.emit("conversation_error", { message: "Invalid Input", code: 400, error });
                    }
                } else {
                    reportError(context, `Error handling event ${event} : ${error.message}`, error);

                    // If we have a session, use its broadcaster to send 500
                    if (this.currentSession) {
                        this.currentSession.broadcaster.broadcastError("Internal Server Error", 500);
                    } else {
                        // Fallback: Emit directly to socket if session creation failed
                        this.socket.emit("conversation_error", { message: "Internal Server Error", code: 500 });
                        Logger.warn(`socket ${this.socket.id}`, "Broadcasted error directly to socket (no active session)");
                    }
                }
            }
        });
    }

    private destroySession() {
        if (this.currentSession) {
            this.currentSession.destroy();
            this.currentSession = null;
        }
    }

    private async handleStart(payload: any) {
        Logger.info("socket", "Starting new meeting session...");
        this.destroySession();

        // Create new session
        this.currentSession = new MeetingManager(this.socket, this.environment);

        // No try-catch needed here, handled by bindSafeListener
        await this.currentSession.initializeStart(payload);
    }

    private async handleReconnect(payload: any) {
        Logger.info("socket", "Reconnecting to meeting session...");

        // 1. Check if payload.meetingId matches active session
        if (this.currentSession && this.currentSession.meetingId === payload.meetingId) {
            Logger.info("socket", "Session already active for this meeting. Syncing only.");
            this.currentSession.syncClient();
            return;
        }

        // 2. Else, destroy and load new
        this.destroySession();
        this.currentSession = new MeetingManager(this.socket, this.environment);

        // No try-catch needed here, handled by bindSafeListener
        await this.currentSession.initializeReconnect(payload);
    }
}
