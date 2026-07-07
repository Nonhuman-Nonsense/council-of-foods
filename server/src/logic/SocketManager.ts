import { Socket } from "socket.io";
import { MeetingManager } from "./MeetingManager.js";
import { SocketBroadcaster } from "./SocketBroadcaster.js";
import { Logger } from "@utils/Logger.js";
import { ClientToServerEvents, ReconnectionOptions, SetupOptions } from "@shared/SocketTypes.js";
import { ZodError } from "zod";
import { getGlobalOptions } from "./GlobalOptions.js";
import {
    getLiveSessionHolder,
    releaseLiveSession,
    tryAcquireLiveSession,
} from "./liveSessionRegistry.js";

import { SetupOptionsSchema, ReconnectionOptionsSchema } from "@models/ValidationSchemas.js";
import { ConflictError, CouncilError } from "@models/Errors.js";
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
    private static readonly activeManagers = new Map<string, SocketManager>();

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
        SocketManager.activeManagers.set(socket.id, this);
        this.setupListeners();
    }

    static lookup(socketId: string): SocketManager | undefined {
        return SocketManager.activeManagers.get(socketId);
    }

    /** Test helper — vitest should reset manager registry between tests. */
    static clearForTests(): void {
        SocketManager.activeManagers.clear();
    }

    private setupListeners() {
        this.socket.on("disconnect", () => {
            Logger.info("socket", `[${this.socket.id}] session disconnected`);
            SocketManager.activeManagers.delete(this.socket.id);
            void this.destroySession("drain");
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
            "skip_human_turn",
            "raise_hand",
            "conclude_meeting",
            "report_maximum_played_index",
            "extend_meeting"
        ];

        if (this.environment === "prototype" || this.environment === "test") {
            proxyEvents.push("pause_conversation");
            proxyEvents.push("resume_conversation");
        }

        for (const event of proxyEvents) {
            this.bindSafeListener(event, async (payload) => {
                // We can safely assert currentSession exists because requireSession=true
                await this.currentSession!.handleEvent(event, payload);
            }, true);
        }
    }

    private socketReportFrom(): { socketId: string } {
        return { socketId: this.socket.id };
    }

    private sessionReportFrom(): MeetingManager | { socketId: string } {
        return this.currentSession ?? this.socketReportFrom();
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
                Logger.warn("socket", `Ignored event ${event} - No active session`, { from: this.socketReportFrom() });
                return;
            }

            try {
                await handler(payload as Parameters<ClientToServerEvents[EventName]>[0]);
            } catch (error: unknown) {
                const context = this.currentSession?.meeting ? "meeting" : "socket";
                const from = this.sessionReportFrom();

                // Route to broadcastWarning vs broadcastError by severity — same client payload today,
                // but the method name is the policy hook (see IMeetingBroadcaster).
                if (error instanceof ZodError) {
                    Logger.warn(
                        context,
                        `Validation error for ${event}; notifying client (400): ${error.message}`,
                        { error, from, clientImpact: 'notified' },
                    );
                    this.socketBroadcaster.broadcastWarning(CouncilError.fromZod(error), context);
                } else if (error instanceof CouncilError) {
                    if (error.statusCode >= 500) {
                        const errMessage = error instanceof Error ? error.message : String(error);
                        Logger.error(
                            context,
                            `Error handling event ${event}; notifying client (${error.statusCode}): ${errMessage}`,
                            { error, from, clientImpact: 'terminal' },
                        );
                        this.socketBroadcaster.broadcastError(error, context);
                    } else {
                        Logger.warn(
                            context,
                            `Error handling event ${event}; notifying client (${error.statusCode}): ${error.clientMessage}`,
                            { error, from, clientImpact: 'notified' },
                        );
                        this.socketBroadcaster.broadcastWarning(error, context);
                    }
                } else {
                    const errMessage = error instanceof Error ? error.message : String(error);
                    Logger.error(
                        context,
                        `Error handling event ${event}; notifying client (500): ${errMessage}`,
                        { error, from, clientImpact: 'terminal' },
                    );
                    this.socketBroadcaster.broadcastError(CouncilError.fromUnexpected(error), context);
                }
            }
        });
    }

    private async destroySession(audioStrategy: "drain" | "cancel" = "drain") {
        if (this.currentSession?.meeting) {
            releaseLiveSession(this.currentSession.meeting._id, this.socket.id);
        }
        if (this.currentSession) {
            await this.currentSession.destroy(audioStrategy);
            this.currentSession = null;
        }
    }

    /** Tear down an active meeting session without waiting for socket disconnect. */
    async abandonLiveSession(audioStrategy: "drain" | "cancel" = "cancel"): Promise<void> {
        await this.destroySession(audioStrategy);
    }

    /**
     * Socket.IO reconnect assigns a new socket id before the old connection is torn down.
     * When the client re-presents the same liveKey, preempt the stale holder instead of 409.
     */
    private async preemptStaleLiveSessionForReconnect(meetingId: number, liveKey: string): Promise<void> {
        const holder = getLiveSessionHolder(meetingId);
        if (!holder || holder.socketId === this.socket.id || holder.liveKey !== liveKey) {
            return;
        }

        Logger.info(
            "socket",
            `Preempting stale live session on socket ${holder.socketId} for reconnect on ${this.socket.id}`,
        );

        const staleManager = SocketManager.lookup(holder.socketId);
        if (staleManager) {
            await staleManager.abandonLiveSession("cancel");
            return;
        }

        releaseLiveSession(meetingId, holder.socketId);
        this.socket.nsp.sockets.get(holder.socketId)?.disconnect(true);
    }

    private async handleStart(payload: SetupOptions) {
        Logger.info("socket", "Starting new meeting session...");
        await this.destroySession("cancel");

        const data = SetupOptionsSchema.parse(payload);

        if (!tryAcquireLiveSession(data.meetingId, this.socket.id, data.liveKey)) {
            Logger.warn("socket",`Live session already held for meeting ${data.meetingId}; rejecting start_conversation on socket ${this.socket.id} (409)`);
            this.socketBroadcaster.broadcastError(new ConflictError());
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

        const data = ReconnectionOptionsSchema.parse(payload);

        await this.preemptStaleLiveSessionForReconnect(data.meetingId, data.liveKey);
        await this.destroySession("cancel");

        if (!tryAcquireLiveSession(data.meetingId, this.socket.id, data.liveKey)) {
            Logger.warn("socket",`Live session already held for meeting ${data.meetingId}; rejecting attempt_reconnection on socket ${this.socket.id} (409)`);
            this.socketBroadcaster.broadcastError(new ConflictError());
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
