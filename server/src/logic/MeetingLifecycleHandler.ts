import type { Message } from '@shared/ModelTypes.js';
import type { ConcludeMeetingMessage, SetupOptions } from '@shared/SocketTypes.js';
import type { ILifecycleContext, IMeetingContext, IMeetingState } from "@interfaces/MeetingInterfaces.js";
import type { Message as AudioMessage } from "@logic/AudioSystem.js";
import { splitSentences } from "@shared/textUtils.js";
import { Logger } from "@utils/Logger.js";
import removeMd from 'remove-markdown';
import type { StoredMeeting } from "@models/DBModels.js";
import { isCompleteReplayManifest } from "../api/replayManifest.js";

/**
 * Promotes a concluded meeting to `meetingComplete: true` — but only once its replay manifest
 * is genuinely complete (ends in a `summary` whose audio is persisted). Called at the end of the
 * live summary flow AND on reconnect (to heal a crash that landed between the summary write and
 * the promotion). Idempotent and safe to call whenever the meeting *might* be finished.
 */
export async function promoteMeetingCompleteIfReady(
    ctx: IMeetingContext & IMeetingState,
): Promise<void> {
    const m = ctx.meeting;
    if (!m || ctx.environment === "prototype") return;

    const stored = await ctx.services.meetingsCollection.findOne({ _id: m._id });
    if (!stored) return;

    const { liveKey: _liveKey, ...meeting } = stored as StoredMeeting;
    if (isCompleteReplayManifest(meeting)) {
        await ctx.services.meetingsCollection.updateOne(
            { _id: m._id },
            { $set: { meetingComplete: true } },
        );
        m.meetingComplete = true;
    } else {
        Logger.warn(
            "meeting",
            "conclude audio barrier finished but replay manifest is incomplete; meetingComplete left false",
            { from: ctx },
        );
    }
}

/**
 * Manages the high-level lifecycle of a meeting: Start, Conclude, Extend, and Summarize.
 * Handles initialization of session state, emitting lifecycle events, and managing the end-of-meeting flow.
 */
export class MeetingLifecycleHandler {
    manager: ILifecycleContext;

    constructor(meetingManager: ILifecycleContext) {
        this.manager = meetingManager;
    }

    /**
     * Connects to the meeting and starts the conversation loop.
     */
    async handleStartConversation(setup: SetupOptions): Promise<void> {
        const { manager } = this;

        // Fetch the meeting from the DB
        const meeting = await manager.services.meetingsCollection.findOne({ _id: setup.meetingId });
        if (!meeting) {
            throw new Error("Meeting not found");
        }

        if(meeting.liveKey !== setup.liveKey) {
            throw new Error("Invalid live key");
        }

        const stored: StoredMeeting = meeting as StoredMeeting;
        manager.meeting = stored;
        // Session serverOptions come from MeetingManager constructor (SocketManager merges prototype overrides from start_conversation).

        Logger.info(`meeting ${stored._id}`, `started (session ${manager.socket.id})`);
        manager.startLoop();
    }

    /**
     * Concludes the meeting: chair closing line (broadcast immediately), then summary.
     */
    async handleConcludeMeeting(message: ConcludeMeetingMessage): Promise<void> {
        const { manager } = this;
        const m = manager.meeting;
        if (!m) return;

        const thisMeetingId = m._id;
        // The conclude sequence has several awaits (chair line, summary, TTS). If the session
        // is torn down or rebound to a different meeting mid-flight (e.g. reconnect churn),
        // abort rather than let a zombie conclude keep writing to a doc a newer manager owns.
        const stale = () => !manager.isActive || manager.meeting?._id !== thisMeetingId;

        Logger.info(`meeting ${m._id}`, "attempting to conclude meeting");

        const queryExtensionIndex = m.conversation.findIndex((m) => m.type === "query_extension");
        if (queryExtensionIndex !== -1) {
            m.conversation = m.conversation.slice(0, queryExtensionIndex);
        } else {
            Logger.info(`meeting ${m._id}`, 'conclude meeting without query_extension sentinel (hard cap auto conclude)');
        }

        const chair = m.characters[0];
        const closingIndex = m.conversation.length;
        const closingPrompt = manager.serverOptions.concludeMeetingPrompt[m.language]
            .replaceAll("[MEETING_ID]", String(m._id));
        const {
            response: closingText,
            id: closingId,
            trimmed: closingTrimmed,
            pretrimmed: closingPretrimmed,
            sentences: closingSentences,
        } = await manager.dialogGenerator.chairInterjection(
            closingPrompt,
            closingIndex,
            manager.serverOptions.concludeMeetingLength,
            m,
            manager.broadcaster
        );

        if (stale()) return;

        const closingMessage: Message = {
            id: closingId || "",
            speaker: chair.id,
            text: closingText,
            type: "message",
            sentences: closingSentences || splitSentences(closingText),
            trimmed: closingTrimmed,
            pretrimmed: closingPretrimmed,
        };

        // Push the closing line AND a durable `summary_pending` marker in a SINGLE write. This
        // is atomic: there is never a persisted/broadcast state with the closing but not the
        // marker (no await between the two pushes). The run loop then generates the summary on
        // its next iteration (decideNextAction → GENERATE_SUMMARY). Because the marker is
        // durable, a disconnect anywhere in the conclude recovers cleanly — resume sees the
        // marker and regenerates the summary, with no duplicate closing line.
        m.conversation.push(closingMessage);
        m.conversation.push({ type: "summary_pending" });
        Logger.info(`meeting ${m._id}`, `closing statement generated on index ${closingIndex}`);

        manager.broadcaster.broadcastConversationUpdate(m.conversation);

        await manager.services.meetingsCollection.updateOne(
            { _id: m._id },
            { $set: { conversation: m.conversation } }
        );

        manager.audioSystem.queueAudioGeneration(
            { ...closingMessage, id: closingMessage.id as string, text: closingMessage.text as string, sentences: closingMessage.sentences! },
            chair,
            m,
            manager.environment,
            manager.serverOptions
        );

        // Kick the loop so it picks up the summary_pending marker and generates the summary.
        // Auto-conclude (loop-driven) is already running, so this just latches a wake; the
        // socket-driven conclude re-enters the loop once its transition settles.
        manager.startLoop();
    }

    /**
     * Generates the meeting summary and replaces the trailing `summary_pending` marker in place
     * with the real `summary` message. Driven by the run loop (GENERATE_SUMMARY) on both the
     * happy path and on reconnect after a mid-conclude disconnect — a single code path, so the
     * two can never diverge.
     */
    async generateSummary({ date }: { date: string }): Promise<void> {
        const { manager } = this;
        const m = manager.meeting;
        if (!m) return;

        // Nothing to do if the marker is already resolved (e.g. a duplicate wake). Guard before
        // spending an LLM call.
        if (m.conversation.findIndex((msg) => msg.type === "summary_pending") === -1) return;

        const thisMeetingId = m._id;
        const stale = () => !manager.isActive || manager.meeting?._id !== thisMeetingId;

        const chair = m.characters[0];
        const summaryPrompt = manager.serverOptions.summarizeMeetingPrompt[m.language]
            .replace("[DATE]", date)
            .replace("[MEETING_ID]", String(m._id));
        const { response, id, trimmed } = await manager.dialogGenerator.generateDocument(
            summaryPrompt,
            m,
            manager.serverOptions.summarizeMeetingLength,
        );

        if (stale()) return;

        // Strip markdown formatting for TTS (prevents reading "**banana**" as "asterisk banana asterisk")
        const textForAudio = removeMd(response);

        const summary: Message = {
            id: id || "",
            speaker: chair.id,
            text: response,
            type: "summary",
            sentences: [],
            trimmed,
            pretrimmed: undefined,
        };

        // Replace the marker in place so the summary occupies the same (tail) index. Removing
        // the marker as soon as we have the TEXT means the client shows the summary immediately;
        // its audio (queued below) arrives shortly after. If a crash lands after this write but
        // before the audio/promotion, reconnect self-heals: missing audio is regenerated and the
        // promotion re-runs (see ConnectionHandler). Re-find after the await in case a concurrent
        // event shifted the marker.
        const summaryIndex = m.conversation.findIndex((msg) => msg.type === "summary_pending");
        if (summaryIndex === -1) return;
        m.conversation[summaryIndex] = summary;
        m.maximumPlayedIndex = summaryIndex;

        manager.broadcaster.broadcastConversationUpdate(m.conversation);
        Logger.info(`meeting ${m._id}`, `summary generated on index ${summaryIndex}`);

        await manager.services.meetingsCollection.updateOne(
            { _id: m._id },
            {
                $set: {
                    conversation: m.conversation,
                    maximumPlayedIndex: summaryIndex,
                },
            },
        );

        const audioMessage = {
            ...summary,
            text: textForAudio,
            sentences: [],
        };

        // Route the summary through the shared AudioQueue like every other message, so the
        // provider concurrency cap is enforced in exactly ONE place and can never be bypassed.
        // skipMatching stays true: the summary is a read-out document, not word-timed subtitles.
        // waitForIdle then acts as the conclude audio barrier — it waits for the closing line +
        // summary + any trailing message audio before we promote meetingComplete.
        manager.audioSystem.queueAudioGeneration(
            audioMessage as AudioMessage,
            chair,
            m,
            manager.environment,
            manager.serverOptions,
            true
        );
        await manager.audioSystem.waitForIdle();

        if (stale()) return;

        await promoteMeetingCompleteIfReady(manager);
    }

    /**
     * Extends the meeting length and resumes the conversation loop if it had stopped due to length limits.
     */
    async handleExtendMeeting(): Promise<void> {
        const { manager } = this;
        const m = manager.meeting;
        if (!m) return;

        Logger.info(`meeting ${m._id}`, "extending meeting");

        // Strip query_extension sentinel before extending.
        const queryExtensionIndex = m.conversation.findIndex((m) => m.type === "query_extension");
        if (queryExtensionIndex === -1) {
            // Stale event — socket buffer flushed before attempt_reconnection completed and the
            // sentinel was already stripped by a prior extend/conclude. Discard gracefully.
            Logger.staleEvent(`meeting ${m._id}`, "extend_meeting", "no query_extension sentinel present", { lastReconnectionAt: manager.lastReconnectionAt, from: manager });
            return;
        }
        m.conversation = m.conversation.slice(0, queryExtensionIndex);

        //if the conversation extra slots is undefined, set it to 0, could happen if the meeting is legacy
        //TODO: Could we have a problem here if we view an old meeting that is already past the max reached?
        //TODO: Should we migrate all old data to set conversationsExtraSlots if more than 10? No because meetings could have different settings?
        if(m.conversationExtraSlots === undefined) {
            m.conversationExtraSlots = 0;
        }
        m.conversationExtraSlots += manager.serverOptions.extraMessageCount;

        await manager.services.meetingsCollection.updateOne(
            { _id: m._id },
            { $set: { conversation: m.conversation, conversationExtraSlots: m.conversationExtraSlots } }
        );

        manager.startLoop();
    }

    /**
     * Pauses the conversation.
     */
    handlePauseConversation(): void {
        const { manager } = this;
        const m = manager.meeting;
        if (!m) return;

        Logger.info(`meeting ${m._id}`, "paused");
        manager.isPaused = true;
    }

    /**
     * Resumes the conversation.
     */
    handleResumeConversation(): void {
        const { manager } = this;
        const m = manager.meeting;
        if (!m) return;

        Logger.info(`meeting ${m._id}`, "resumed");
        manager.isPaused = false;
        manager.startLoop();
    }
}
