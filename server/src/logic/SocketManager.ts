import { Socket } from "socket.io";
import { MeetingManager } from "./MeetingManager.js";
import { SocketBroadcaster } from "./SocketBroadcaster.js";
import { Logger } from "@utils/Logger.js";
import { ClientToServerEvents, ReconnectionOptions, SetupOptions } from "@shared/SocketTypes.js";
import { ZodError } from "zod";
import { getGlobalOptions } from "./GlobalOptions.js";
import {
    releaseLiveSession,
    tryAcquireLiveSession,
} from "./liveSessionRegistry.js";

/** Shared user-facing 409 reason for live-session conflicts across HTTP + socket. */
const LIVE_SESSION_CONFLICT_MESSAGE = "This meeting is happening somewhere else";
import { SetupOptionsSchema, ReconnectionOptionsSchema } from "@models/ValidationSchemas.js";

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
    /**
     * Connection-scoped broadcaster (same socket as `MeetingManager`’s broadcaster).
     * SocketManager uses this for lifecycle/validation errors; the session uses its own instance for meeting traffic — both emit on the same socket.
     */
    private readonly socketBroadcaster: SocketBroadcaster;

    constructor(socket: Socket, environment: string) {
        this.socket = socket;
        this.environment = environment;
        this.socketBroadcaster = new SocketBroadcaster(socket);
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
            "raise_hand",
            "wrap_up_meeting",
            "report_maximum_played_index",
            "continue_conversation"
        ];

        if (this.environment === "prototype" || this.environment === "test") {
            proxyEvents.push("submit_injection");
            proxyEvents.push("pause_conversation");
            proxyEvents.push("resume_conversation");
            proxyEvents.push("remove_last_message");
        }

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
    private bindSafeListener<EventName extends keyof ClientToServerEvents>(
        event: EventName,
        handler: (payload: Parameters<ClientToServerEvents[EventName]>[0]) => Promise<void>,
        requireSession: boolean = false
    ) {
        // We cast event to string to bypass the strict mapped type check of strict socket.io
        // The type safety is enforced by the method signature of bindSafeListener itself.
        this.socket.on(event as string, async (payload: unknown) => {
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
                Logger.warn("socket", `Ignored event ${event} - No active session`);
                return;
            }

            try {
                await handler(payload as Parameters<ClientToServerEvents[EventName]>[0]);
            } catch (error: unknown) {
                // Report to external error service
                const context = this.currentSession?.meeting
                    ? `meeting ${this.currentSession.meeting._id}`
                    : `socket ${this.socket.id}`;

                if (error instanceof ZodError) {
                    Logger.warn(context, `Validation error for ${event}; notifying client (400): ${error.message}`, error);
                    this.socketBroadcaster.broadcastWarning("Invalid Input", 400, error);
                } else {
                    const errMessage = error instanceof Error ? error.message : String(error);
                    Logger.error(context, `Error handling event ${event}; notifying client (500): ${errMessage}`, error);
                    this.socketBroadcaster.broadcastError("Internal Server Error", 500);
                }
            }
        });
    }

    private destroySession() {
        if (this.currentSession?.meeting) {
            releaseLiveSession(this.currentSession.meeting._id, this.socket.id);
        }
        if (this.currentSession) {
            this.currentSession.destroy();
            this.currentSession = null;
        }
    }

    private async handleStart(payload: SetupOptions) {
        Logger.info("socket", "Starting new meeting session...");
        this.destroySession();

        const data = SetupOptionsSchema.parse(payload);

        if (!tryAcquireLiveSession(data.meetingId, this.socket.id, data.creatorKey)) {
            Logger.warn("socket",`Live session already held for meeting ${data.meetingId}; rejecting start_conversation on socket ${this.socket.id} (409)`);
            this.socketBroadcaster.broadcastError(LIVE_SESSION_CONFLICT_MESSAGE, 409);
            return;
        }

        const baseOptions = getGlobalOptions();
        const serverOptions = this.environment === "prototype" ? ({ ...baseOptions, ...(payload.serverOptions || {}) }) : baseOptions;

        this.currentSession = new MeetingManager(this.socket, this.environment, serverOptions);

        try {
            await this.currentSession.initializeStart(payload);
        } catch (e) {
            releaseLiveSession(data.meetingId, this.socket.id);
            throw e;
        }
    }

    private async handleReconnect(payload: ReconnectionOptions) {
        Logger.info("socket", "Reconnecting to meeting session...");

        // 1. Check if payload.meetingId matches active session
        if (
            this.currentSession?.meeting &&
            this.currentSession.meeting._id === Number(payload.meetingId)
        ) {
            Logger.info("socket", "Session already active for this meeting. Syncing only.");
            await this.currentSession.syncClient();
            return;
        }

        this.destroySession();

        const data = ReconnectionOptionsSchema.parse(payload);

        if (!tryAcquireLiveSession(data.meetingId, this.socket.id, data.creatorKey)) {
            Logger.warn("socket",`Live session already held for meeting ${data.meetingId}; rejecting attempt_reconnection on socket ${this.socket.id} (409)`);
            this.socketBroadcaster.broadcastError(LIVE_SESSION_CONFLICT_MESSAGE, 409);
            return;
        }

        this.currentSession = new MeetingManager(this.socket, this.environment);

        try {
            const ok = await this.currentSession.initializeReconnect(payload);
            if (!ok) {
                releaseLiveSession(data.meetingId, this.socket.id);
            }
        } catch (e) {
            releaseLiveSession(data.meetingId, this.socket.id);
            throw e;
        }
    }
}
