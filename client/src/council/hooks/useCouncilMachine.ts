import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { useCouncilSocket } from "./useCouncilSocket";
import type { Character, Message, Meeting, Topic } from "@shared/ModelTypes";
import type { DecodedAudioMessage } from "@shared/SocketTypes";
import { resumeMeeting, ResumeMeetingError } from "@api/resumeMeeting";
import { councilFetch } from "@api/http";
import { httpErrorMessage } from "@api/httpErrorMessage";
import { notifyAutoplay } from "@/autoplay/autoplayStore";
import {
    useErrorStore,
    setConnectionError,
    setUnrecoverableError,
} from "@main/overlay/errorStore";
import {
    usePendingIntentStore,
    setPendingIntent,
    clearPendingIntent,
    clearAllPendingIntents,
    type PendingIntent,
} from "./pendingIntentStore";
import type { MetaAgentPhase } from "@museum/metaAgent/useMetaAgent";
import type { AgentMode } from "@/settings/councilSettings";
import { useDocumentVisibility } from "@/utils";

/** Keep the loading UI visible this long on first paint so the Loading animation can run. */
const MIN_INITIAL_LOADING_DISPLAY_MS = import.meta.env.VITEST ? 0 : 2000;

export interface UseCouncilMachineProps {
    currentMeetingId: number;
    liveKey: string | undefined;
    setliveKey: (key: string) => void;
    replayManifest: Meeting | null;
    topic: Topic | null;
    participants: Character[] | null;
    humanName: string;
    setHumanName: (name: string) => void;
    audioContext: React.RefObject<AudioContext | null>;
    isPaused: boolean;
    setPaused: (paused: boolean) => void;
    isMuseumMode: boolean;
    agentMode: AgentMode;
    setMetaAgentPhase: React.Dispatch<React.SetStateAction<MetaAgentPhase>>;
    metaAgentPhase: MetaAgentPhase;
}

export type CouncilState =
    | "loading"
    | "playing"
    | "waiting"
    | "human_input"
    | "human_panelist"
    | "summary"
    | "meeting_incomplete"
    | "query_extension";

/** Council states that show a modal overlay (same name as the state). */
export type OverlayCouncilState = Extract<
    CouncilState,
    "query_extension" | "meeting_incomplete" | "summary"
>;

/** Overlay council states share names with `councilState`; `name` is user-initiated only. */
export type CouncilOverlayType = OverlayCouncilState | "name" | null;

const OVERLAY_COUNCIL_STATES: readonly OverlayCouncilState[] = [
    "query_extension",
    "meeting_incomplete",
    "summary",
];

function isOverlayCouncilState(
    state: CouncilState,
): state is OverlayCouncilState {
    return (OVERLAY_COUNCIL_STATES as readonly CouncilState[]).includes(state);
}

function resolveVisibleCouncilOverlay(params: {
    councilState: CouncilState;
    nameOverlayOpen: boolean;
    isMuseumMode: boolean;
    agentMode: AgentMode;
}): CouncilOverlayType {
    if (params.nameOverlayOpen) {
        return "name";
    }
    if (
        params.councilState === "query_extension" &&
        params.isMuseumMode &&
        params.agentMode === "ptt"
    ) {
        return null;
    }
    if (isOverlayCouncilState(params.councilState)) {
        return params.councilState;
    }
    return null;
}

function playIndexBeforeOverlayState(
    messages: Message[],
    overlayState: OverlayCouncilState,
): number {
    const markerIndex = messages.findIndex((m) => m.type === overlayState);
    if (overlayState === "summary") {
        return Math.max(0, markerIndex > 0 ? markerIndex - 1 : messages.length - 2);
    }
    const lastContent = markerIndex >= 0 ? markerIndex - 1 : messages.length - 1;
    return Math.max(0, lastContent);
}

export function useCouncilMachine({
    currentMeetingId,
    liveKey,
    setliveKey,
    replayManifest,
    topic: _topic,
    participants: _participants,
    humanName,
    setHumanName,
    audioContext,
    isPaused,
    setPaused,
    isMuseumMode,
    agentMode,
    setMetaAgentPhase,
    metaAgentPhase,
}: UseCouncilMachineProps) {
    const connectionError = useErrorStore((s) => s.connectionError);

    const { t } = useTranslation();
    const isDocumentVisible = useDocumentVisibility();

    /* -------------------------------------------------------------------------- */
    /*                             Main State Variables                           */
    /* -------------------------------------------------------------------------- */
    // Keep the runtime state machine explicit so orchestration components can narrow safely
    // when shared scene logic is split into app-specific leaf components.
    const [councilState, setCouncilState] = useState<CouncilState>("loading");
    const [playingNowIndex, setPlayingNowIndex] = useState(-1);
    const [playNextIndex, setPlayNextIndex] = useState(0);

    const [textMessages, setTextMessages] = useState<Message[]>([]); // State to store conversation updates
    const [audioMessages, setAudioMessages] = useState<DecodedAudioMessage[]>([]); // To store multiple ArrayBuffers
    const [nameOverlayOpen, setNameOverlayOpen] = useState(false);
    const [summary, setSummary] = useState<Message | null>(null);

    const [isRaisedHand, setIsRaisedHand] = useState(false);

    const pendingIntent = usePendingIntentStore((s) => s.intent);

    // Clear all pending intents when this hook unmounts (meeting change / navigation).
    // Belt-and-suspenders: intents are also tagged with meetingId so a stale intent
    // can never apply to a different meeting even if this cleanup is somehow missed.
    useEffect(() => () => clearAllPendingIntents(), []);

    /** True from socket reconnect until the server sends conversation state again. */
    const [attemptingReconnect, setAttemptingReconnect] = useState(false);

    /**
     * True when the socket layer is unhealthy (connect_error) but playback may still continue
     * from buffered data. The public connectionError overlay is only shown when the machine
     * is actually stuck — see the deferred blocked effect below.
     */
    const [socketUnhealthy, setSocketUnhealthy] = useState(false);

    // Limits
    const [maximumPlayedIndex, setMaximumPlayedIndex] = useState(0);

    // States from lower down (Snippet management)
    const [currentSnippetIndex, setCurrentSnippetIndex] = useState(0);

    // Routing
    const location = useLocation();

    // Refs
    const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    /** After mount / meeting change, blocks leaving `loading` until this is true (first ~2s only). */
    const [initialLoadingMinElapsed, setInitialLoadingMinElapsed] = useState(false);
    useEffect(() => {
        setInitialLoadingMinElapsed(false);
        const id = window.setTimeout(
            () => setInitialLoadingMinElapsed(true),
            MIN_INITIAL_LOADING_DISPLAY_MS,
        );
        return () => window.clearTimeout(id);
    }, [currentMeetingId]);

    // Derived State
    const [canGoBack, setCanGoBack] = useState(false);
    const [canGoForward, setCanGoForward] = useState(false);
    const [canRaiseHand, setCanRaiseHand] = useState(false);

    const visibleOverlay = useMemo(
        () => resolveVisibleCouncilOverlay({
            councilState,
            nameOverlayOpen,
            isMuseumMode,
            agentMode,
        }),
        [councilState, nameOverlayOpen, isMuseumMode, agentMode],
    );

    // The one thing that distinguishes the "another live session holds this meeting" case
    // (previously its own `meeting_elsewhere` state) from an ordinary `meeting_incomplete`:
    // read straight off the message rather than mirroring it into separate state, since the
    // sentinel stays in `textMessages` for as long as the overlay is shown.
    const meetingElsewhere = useMemo(
        () => textMessages.find((m) => m.type === 'meeting_incomplete')?.elsewhere ?? false,
        [textMessages],
    );

    /* -------------------------------------------------------------------------- */
    /*                             Socket & Startup                               */
    /* -------------------------------------------------------------------------- */
    const socketRef = useCouncilSocket({
        meetingId: currentMeetingId,
        liveKey,
        onReconnect: () => {
            setAttemptingReconnect(true);
            if (currentMeetingId > 0 && liveKey && socketRef.current) {
                socketRef.current.emit("attempt_reconnection", {
                    meetingId: currentMeetingId,
                    liveKey,
                    handRaised: isRaisedHand,
                });
            }
        },
        onAudioUpdate: (audioMessage) => {
            (async () => {
                if (audioMessage.audio && audioContext.current) {
                    try {
                        const buffer = await audioContext.current.decodeAudioData(
                            audioMessage.audio as unknown as ArrayBuffer
                        );
                        const decodedMessage: DecodedAudioMessage = { ...audioMessage, audio: buffer };
                        setAudioMessages((prevAudioMessages) => [
                            ...prevAudioMessages,
                            decodedMessage,
                        ]);
                    } catch (e) {
                        console.error("Audio decode error", e);
                    }
                }
            })();
        },
        onConversationUpdate: (textMessages) => {
            // First conversation_update after reconnect completes the handshake (server session is ready).
            setAttemptingReconnect(false);
            setTextMessages(() => textMessages);
        },
        onError: (error) => {
            console.error(error);
            const msg = error.message?.trim() ? error.message : t("error.message");
            setUnrecoverableError({
                message: msg,
                source: "useCouncilMachine.conversation_error",
                cause: error,
                meetingId: currentMeetingId,
            });
        },
        onConnectionError: (err) => {
            console.error(err);
            setSocketUnhealthy(true);
        },
        onConnect: () => {
            setSocketUnhealthy(false);
            setConnectionError("socket", false);
        },
    });

    const decodeReplayClip = useCallback(
        async (audioId: string, signal: AbortSignal): Promise<DecodedAudioMessage> => {
            const res = await councilFetch(`/api/audio/${encodeURIComponent(audioId)}`, {
                method: "GET",
                headers: { Accept: "application/json" },
                signal,
            });
            if (!res.ok) {
                const message = await httpErrorMessage(res, `Replay audio fetch failed (${res.status})`);
                throw new Error(message);
            }
            const clip = await res.json();
            const ctx = audioContext.current;
            if (!ctx) {
                throw new Error("AudioContext not available");
            }
            const bin = atob(clip.audioBase64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) {
                bytes[i] = bin.charCodeAt(i);
            }
            const buffer = await ctx.decodeAudioData(
                bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
            );
            return { id: clip.id, type: clip.type, sentences: clip.sentences, audio: buffer };
        },
        [audioContext],
    );

    // Download first audio, then batch download the rest
    async function downloadAudio(audioIds: string[], ac: AbortController) {
        if (audioIds.length === 0) return;
        try {
            const firstDecoded = await decodeReplayClip(audioIds[0], ac.signal);
            if (ac.signal.aborted) return;
            setAudioMessages(prev => [...prev, firstDecoded]);
            const batchSize = 6;
            for (let i = 1; i < audioIds.length; i += batchSize) {
                const batch = audioIds.slice(i, i + batchSize);
                await Promise.all(
                    batch.map(async (id) => {
                        const decodedAudio = await decodeReplayClip(id, ac.signal)
                        if (ac.signal.aborted) return;
                        setAudioMessages(prev => [...prev, decodedAudio]);
                    }),
                );
            }
        } catch (e) {
            if (!ac.signal.aborted) {
                const msg = t("error.audioLoad");
                setUnrecoverableError({
                    message: msg,
                    source: "useCouncilMachine.audioDownload",
                    cause: e,
                    meetingId: currentMeetingId,
                });
                console.error("Audio download error", e);
            }
        }
    }

    // Replay startup logic
    useEffect(() => {
        if (liveKey || !replayManifest) {
            return;
        }

        const meeting = replayManifest;
        setTextMessages(meeting.conversation);

        // Download the audio in the background
        const ac = new AbortController();
        downloadAudio(meeting.audio, ac);

        return () => {
            ac.abort();
        };
    }, [liveKey, replayManifest]);

    /* -------------------------------------------------------------------------- */
    /*                               Helpers                                      */
    /* -------------------------------------------------------------------------- */

    /**
     * Checks if the required text and audio data for the `playNextIndex` are available in local state.
     */
    function tryToFindTextAndAudio() {
        const textMessage = textMessages[playNextIndex];
        if (textMessage) {
            const matchingAudioMessage = audioMessages.find((a) => a.id === textMessage.id);
            if (matchingAudioMessage) {
                return true;
            }
        }
        return false;
    }

    // If we reach the end of one message, figure out what to do next
    const calculateNextAction = useCallback((wait = false) => {
        if (councilState === 'human_input' || councilState === 'human_panelist') {// if human input was submitted
            setCouncilState('loading');
        } else if (councilState === 'playing' || councilState === 'waiting') {
            // Server drives the conversation, so we just increment the index
            setPlayNextIndex(playingNowIndex + 1);
            if (wait) {
                setCouncilState('waiting');
            } else {
                setCouncilState('playing');
            }
        }
    }, [councilState, playingNowIndex]);

    /* -------------------------------------------------------------------------- */
    /*                          Main State Machine Logic                          */
    /* -------------------------------------------------------------------------- */
    useEffect(() => {
        //In all cases except if we are still waiting, clear the wait timer on state change
        if (councilState !== 'waiting' && waitTimer.current) {
            clearTimeout(waitTimer.current);
            waitTimer.current = null;
        }

        //If message is skipped
        if (textMessages[playNextIndex]?.type === 'skipped') {
            console.log(`[warning] skipped speaker ${textMessages[playNextIndex].speaker}`);
            setPlayNextIndex(current => current + 1);
            return;
        }

        // Action A — skip a stale invitation replay when we already have a
        // human-draft intent queued for the awaiting_* sentinel right after it.
        // Only reachable on the reconnect self-heal path: the invitation was
        // already heard once before the original submit was lost, so replaying
        // it again is pure noise. Gated on BOTH the invitation and its trailing
        // sentinel being present (matching the intent's captured index), so
        // this can never fire in the narrow window where the invitation has
        // arrived but the sentinel hasn't yet — see "invitation / playback-index
        // rewind nuance" in the resilience plan. Checked here, ahead of the
        // switch below, so the invitation's audio is never dispatched in the
        // first place (a separate effect running after this one would risk a
        // one-frame flash of the invitation before jumping past it).
        if (
            pendingIntent?.kind === 'human-draft' &&
            pendingIntent.meetingId === currentMeetingId &&
            playNextIndex + 1 === pendingIntent.index &&
            textMessages[playNextIndex]?.type === 'invitation' &&
            textMessages[pendingIntent.index]?.type ===
                (pendingIntent.mode === 'panelist' ? 'awaiting_human_panelist' : 'awaiting_human_question')
        ) {
            setPlayingNowIndex(playNextIndex);
            setPlayNextIndex(pendingIntent.index);
            return;
        }

        // This will be triggered directly when text is set
        if (councilState !== 'summary' && textMessages[playNextIndex]?.type === 'summary') {
            setCouncilState("summary");
            return;
        }

        //If we have reached a meeting incomplete message (server flags `elsewhere` when
        //another live session currently holds the meeting; see `meetingElsewhere` below)
        if (councilState !== 'meeting_incomplete' && textMessages[playNextIndex]?.type === 'meeting_incomplete') {
            setCouncilState('meeting_incomplete');
            return;
        }

        // Conversation length cap (server-sent synthetic)
        if (councilState !== 'query_extension' && textMessages[playNextIndex]?.type === 'query_extension') {
            setCouncilState('query_extension');
            return;
        }


        //If we have reached a human panelist (live only)
        if (councilState !== 'human_panelist' && textMessages[playNextIndex]?.type === 'awaiting_human_panelist') {
            setCouncilState('human_panelist');
            return;
        }

        //If we have reached a human question (live only)
        if (councilState !== 'human_input' && textMessages[playNextIndex]?.type === 'awaiting_human_question') {
            setCouncilState('human_input');
            return;
        }


        switch (councilState) {
            case 'loading':
                if (tryToFindTextAndAudio() && initialLoadingMinElapsed) {
                    setPlayingNowIndex(playNextIndex);
                    setCouncilState("playing");
                }
                break;
            case 'playing':
                if (playingNowIndex !== playNextIndex) {
                    if (tryToFindTextAndAudio()) {//Attempt to play it
                        setPlayingNowIndex(playNextIndex);
                    } else {//If it's not ready, show the loading
                        setCouncilState('loading');
                    }
                }
                break;
            case 'meeting_incomplete':
                if (textMessages[playNextIndex]?.type !== 'meeting_incomplete') {
                    rewindOverlayCouncilState(councilState);
                    return;
                }
                break;
            case 'human_panelist':
                break;
            case 'human_input':
                break;
            case 'summary':
                if (summary === null && textMessages[playNextIndex]?.type === 'summary') {
                    setSummary(textMessages[playNextIndex]);
                }
                if (textMessages[playNextIndex]?.type !== 'summary') {
                    rewindOverlayCouncilState(councilState);
                    return;
                }
                if (tryToFindTextAndAudio()) {
                    if (playingNowIndex !== playNextIndex) {
                        setPlayingNowIndex(playNextIndex);
                        setPaused(false);
                    }
                }
                break;
            case 'waiting':
                //Wait one second, and then proceed
                if (waitTimer.current == null) {//Unless we are already waiting
                    waitTimer.current = setTimeout(() => {
                        setCouncilState('playing');
                    }, 1000);
                }
                break;
            case 'query_extension':
                if (isMuseumMode && agentMode === "ptt") {
                    setMetaAgentPhase("extension");
                }
                if (textMessages[playNextIndex]?.type !== 'query_extension') {
                    rewindOverlayCouncilState(councilState);
                    return;
                }
                break;
            default:
                break;
        }
    }, [councilState, textMessages, audioMessages, playingNowIndex, playNextIndex, liveKey, summary, initialLoadingMinElapsed, isMuseumMode, agentMode, setMetaAgentPhase, pendingIntent, currentMeetingId]);

    /* -------------------------------------------------------------------------- */
    /*                                 Actions                                    */
    /* -------------------------------------------------------------------------- */

    function rewindOverlayCouncilState(state: CouncilState) {
        if (!isOverlayCouncilState(state)) {
            return;
        }
        setPlayNextIndex(playIndexBeforeOverlayState(textMessages, state));
        setCouncilState("playing");
    }

    function handleOnFinishedPlaying() {
        const activeMessage = textMessages[playingNowIndex];
        if (councilState === "summary" && activeMessage?.type === "summary") {
            notifyAutoplay({ type: "summary-playback-finished" });
        }
        calculateNextAction(true);
    }

    function handleOnSkipBackward() {
        let skipLength = 1;
        while (textMessages[playingNowIndex - skipLength]?.type === 'skipped') {
            skipLength++;
        }
        if (playingNowIndex - skipLength >= 0) {
            setPlayNextIndex(playingNowIndex - skipLength);
            if (councilState === 'waiting') {
                setCouncilState('playing');
            }
        }
    }

    function handleOnSkipForward() {
        calculateNextAction();
    }

    /**
     * Applies a human submission: emits to the server and advances local state.
     * Shared by the direct submit path and the human-draft reconciler retry, so
     * a resubmission after a self-heal behaves identically to the first attempt.
     */
    function performHumanSubmit(text: string, mode: "question" | "panelist", speaker?: string) {
        if (mode === "panelist") {
            // speaker is always supplied by callers when mode is "panelist"
            // (captured from the awaiting_human_panelist message's speaker).
            if (socketRef.current) socketRef.current.emit("submit_human_panelist", { text, speaker: speaker as string });
        } else {
            if (socketRef.current) socketRef.current.emit("submit_human_message", { text });
        }

        const now = textMessages[playingNowIndex]?.type === 'invitation' ? playingNowIndex - 1 : playingNowIndex;
        const next = textMessages[playingNowIndex]?.type === 'invitation' ? playNextIndex - 1 : playNextIndex;
        // Slice target intentionally differs by mode (matches pre-existing,
        // pre-intent behavior): panelist truncates to `next`, question to `now`.
        setTextMessages((prevMessages) => prevMessages.slice(0, mode === "panelist" ? next : now));
        setPlayingNowIndex(now);
        setPlayNextIndex(next);
        if (mode === "question") {
            setIsRaisedHand(false);
            clearPendingIntent("raise-hand");
        }
        calculateNextAction();
    }

    function handleOnSubmitHumanMessage(newTopic: string) {
        if (councilState === 'human_panelist') {
            const pendingMessage = textMessages[playNextIndex];
            if (pendingMessage?.type !== 'awaiting_human_panelist') {
                const detail = "Internal state mismatch: expected awaiting_human_panelist before submitting panelist response.";
                console.error(detail);
                setUnrecoverableError({
                    message: detail,
                    source: "useCouncilMachine.submit_panelist",
                    meetingId: currentMeetingId,
                });
                return;
            }

            // Register the draft as a durable intent BEFORE applying it: if this
            // submit is lost to a disconnect, the retained text survives and the
            // reconciler retries once councilState catches back up to
            // human_panelist (see the "human-draft" reconciler case below).
            setPendingIntent({
                kind: "human-draft",
                meetingId: currentMeetingId,
                text: newTopic,
                mode: "panelist",
                index: playNextIndex,
                speaker: pendingMessage.speaker,
            });
            performHumanSubmit(newTopic, "panelist", pendingMessage.speaker);
        } else {
            setPendingIntent({
                kind: "human-draft",
                meetingId: currentMeetingId,
                text: newTopic,
                mode: "question",
                index: playNextIndex,
            });
            performHumanSubmit(newTopic, "question");
        }
    }

    /**
     * Applies a skipped human turn: emits to the server and advances local
     * state. Shared by the direct abandon path and the skip-turn reconciler
     * retry — fully self-contained (re-derives now/next from current
     * playingNowIndex/playNextIndex on every call) so a retry behaves
     * identically to the first attempt. See the resolve-extension bug note in
     * the resilience plan for why this matters: a shared apply helper must
     * never depend on state a caller "just" set up.
     */
    function performSkipTurn(speaker: string) {
        if (socketRef.current) socketRef.current.emit("skip_human_turn");

        const now =
            textMessages[playingNowIndex]?.type === "invitation" ? playingNowIndex - 1 : playingNowIndex;
        const next =
            textMessages[playingNowIndex]?.type === "invitation" ? playNextIndex - 1 : playNextIndex;

        setTextMessages((prevMessages) => {
            const base = prevMessages.slice(0, next);
            base.push({
                type: "skipped",
                speaker,
                text: "",
                id: `skip-local-${Date.now()}`,
            });
            return base;
        });
        setPlayingNowIndex(now);
        setPlayNextIndex(next);
        setIsRaisedHand(false);
        clearPendingIntent("raise-hand");
        calculateNextAction();
    }

    function handleOnAbandonHumanTurn() {
        const expectedType =
            councilState === "human_panelist" ? "awaiting_human_panelist" : "awaiting_human_question";
        const awaitingMsg = textMessages[playNextIndex];
        if (awaitingMsg?.type !== expectedType) {
            const detail = `Internal state mismatch: expected ${expectedType} before abandoning human turn.`;
            console.error(detail);
            setUnrecoverableError({
                message: detail,
                source: "useCouncilMachine.skip_human_turn",
                meetingId: currentMeetingId,
            });
            return;
        }

        const speaker =
            awaitingMsg.type === "awaiting_human_panelist" ? awaitingMsg.speaker : humanName;

        // Register the skip as a durable intent BEFORE applying it: if this
        // choice is lost to a disconnect, the reconciler retries once
        // councilState catches back up to human_input/human_panelist (see the
        // "skip-turn" reconciler case below).
        setPendingIntent({
            kind: "skip-turn",
            meetingId: currentMeetingId,
            mode: awaitingMsg.type === "awaiting_human_panelist" ? "panelist" : "question",
            index: playNextIndex,
            speaker,
        });
        performSkipTurn(speaker);
    }

    function declineOverlay() {
        if (nameOverlayOpen) {
            setNameOverlayOpen(false);
            return;
        }
        rewindOverlayCouncilState(councilState);
    }

    /**
     * Applies the user's extend/conclude choice: emits to the server and advances
     * local state. Shared by the direct handler and the resolve-extension
     * reconciler retry, so a resubmission after a self-heal behaves identically
     * to the first attempt.
     */
    function performResolveExtension(choice: "extend" | "conclude", date?: string) {
        // Truncate here (not just in the direct handlers) so a reconciler retry
        // also removes the sentinel — otherwise the retry would re-emit and
        // reset councilState to 'loading' while the query_extension message is
        // still the next thing to play, flipping straight back to
        // 'query_extension' and re-triggering the reconciler forever.
        const queryExtensionIndex = textMessages.findIndex((m) => m.type === 'query_extension');
        if (queryExtensionIndex !== -1) {
            setTextMessages(prevMessages => prevMessages.slice(0, queryExtensionIndex));
        }
        if (choice === "extend") {
            if (socketRef.current) socketRef.current.emit("extend_meeting");
        } else {
            // date is always supplied by callers when choice is "conclude"
            // (captured from the browser clock at decision time).
            if (socketRef.current) socketRef.current.emit("conclude_meeting", { date: date as string });
        }
        setPaused(false);
        setCouncilState('loading');
    }

    function handleOnExtendMeeting() {
        const queryExtensionIndex = textMessages.findIndex((m) => m.type === 'query_extension');
        // Register the choice as a durable intent BEFORE applying it: if this
        // choice is lost to a disconnect, the reconciler retries once
        // councilState catches back up to query_extension (see the
        // "resolve-extension" reconciler case below).
        setPendingIntent({
            kind: "resolve-extension",
            meetingId: currentMeetingId,
            choice: "extend",
            index: queryExtensionIndex,
        });
        performResolveExtension("extend");
    }

    function handleOnConcludeMeeting() {
        const queryExtensionIndex = textMessages.findIndex((m) => m.type === 'query_extension');
        const browserDate = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        setPendingIntent({
            kind: "resolve-extension",
            meetingId: currentMeetingId,
            choice: "conclude",
            index: queryExtensionIndex,
            date: browserDate,
        });
        performResolveExtension("conclude", browserDate);
    }

    /**
     * PUT `/api/meetings/:id` → rotate `liveKey`, reconcile the local replay buffer
     * against the server's sanitized conversation, then hand over to the live socket
     * by calling the lifted `setliveKey`. See Phase 9 of the replay/live doc.
     */
    async function handleOnAttemptResume() {

        // strip the meeting_incomplete message
        const meetingIncompleteIndex = textMessages.findIndex((message) => message.type === 'meeting_incomplete');
        if (meetingIncompleteIndex !== -1) {
            setTextMessages((prevMessages) => prevMessages.slice(0, meetingIncompleteIndex));
        }

        // Go to loading state, and remove the overlay once the state is set
        setCouncilState(("loading"));
        setPaused(false);


        try {
            const response = await resumeMeeting({ meetingId: currentMeetingId });
            const updatedConversation = response.meeting.conversation;
            const updatedAudioIds = response.meeting.audio;

            // Set the conversation, might be new messages at the end, or might be the same as the previous conversation
            setTextMessages(updatedConversation);

            // Download the missing audios in the background
            const currentAudioIds = new Set(audioMessages.map((a) => a.id));
            const missingAudioIds = updatedAudioIds.filter((id) => !currentAudioIds.has(id));
            if (missingAudioIds.length > 0) {
                const ac = new AbortController();
                downloadAudio(missingAudioIds, ac);
            }

            // Flip to live directly, no need to wait for the audio to be downloaded
            // This will allow us to raise hand past this point etc.
            setliveKey(response.liveKey);
        } catch (err) {
            const msg =
                err instanceof ResumeMeetingError
                    ? err.message
                    : err instanceof Error && err.message.trim().length > 0
                      ? err.message
                      : t("error.message");
            const isNotFound = err instanceof ResumeMeetingError && err.status === 404;
            setUnrecoverableError({
                message: msg,
                source: "useCouncilMachine.resume",
                cause: err,
                meetingId: currentMeetingId,
                severity: isNotFound ? "info" : undefined,
            });
        }
    }


    function raiseHand(name: string) {
        const index = playingNowIndex + 1;
        setIsRaisedHand(true);
        // Trim client-side messages to the raise point for immediate UI feedback.
        setTextMessages((prev) => prev.slice(0, index));
        // Register intent: the reconciler emits raise_hand once the socket is
        // healthy and the reconnect handshake has completed.
        setPendingIntent({ kind: "raise-hand", meetingId: currentMeetingId, index, humanName: name });
    }

    function handleHumanNameEntered(input: { humanName: string }) {
        if (input.humanName) {
            setHumanName(input.humanName);
            setPaused(false);
            setNameOverlayOpen(false);
            raiseHand(input.humanName);
        }
    }

    function handleOnRaiseHand() {
        if (humanName === "") {
            setNameOverlayOpen(true);
        } else {
            raiseHand(humanName);
        }
    }

    // Furthest playback index (UI + replay cap): skip while reconnect handshake is in flight.
    useEffect(() => {
        if (!liveKey || !socketRef.current || currentMeetingId <= 0 || attemptingReconnect) {
            return;
        }
        if (playingNowIndex < 0) {
            return;
        }
        const maxLocalIndex = textMessages.length - 1;
        if (maxLocalIndex < 0) {
            return;
        }
        if (playingNowIndex > maximumPlayedIndex) {
            setMaximumPlayedIndex(playingNowIndex);
        }
        const summaryIndex = textMessages.findIndex((message) => message.type === 'summary');
        const furthest = Math.min(maxLocalIndex, Math.max(maximumPlayedIndex, playingNowIndex, summaryIndex));
        socketRef.current.emit("report_maximum_played_index", { index: furthest });
    }, [playingNowIndex, maximumPlayedIndex, liveKey, currentMeetingId, attemptingReconnect, textMessages]);

    // Update canGoBack etc
    useEffect(() => {
        setCanGoBack(
            (councilState === 'playing' ||
                councilState === 'waiting' ||
                councilState === 'summary') &&
            playingNowIndex !== 0
        );
        setCanGoForward(
            (councilState === 'playing' || councilState === 'waiting')
        );
        if (!liveKey) {
            setCanRaiseHand(false);
            return;
        }
        // Once the meeting is concluding (closing line + summary_pending) or concluded (summary),
        // it is finished — hide raise-hand. The marker is broadcast atomically with the closing
        // line, so this hides the button from the moment the conclusion begins. The server also
        // rejects late raise-hand requests, so this is purely the UX half of that gate.
        const isConcluding = textMessages.some(
            (msg) => msg.type === 'summary_pending' || msg.type === 'summary'
        );
        setCanRaiseHand(
            (councilState === 'playing' || councilState === 'waiting') &&
            playingNowIndex === maximumPlayedIndex &&
            !isConcluding
        );
    }, [councilState, playingNowIndex, maximumPlayedIndex, liveKey, textMessages]);

    // Pending intent reconciler.
    //
    // Desired state = what the client has committed to do (pendingIntent).
    // Observed state = conversation + councilState + socket health.
    // This effect applies the intent whenever observed state makes it valid.
    //
    // Global gate: socket must be healthy and the reconnect handshake must have
    // completed before any intent is applied. This means intents registered
    // during a disconnect sit harmlessly in the store until the server session
    // is restored, at which point they fire against fresh server state.
    //
    // Idempotency: each case clears the intent only once it observes the
    // request's outcome (not right before/after firing the emit) — see the
    // per-case comments and "Invariants & backstops" in the resilience plan.
    useEffect(() => {
        if (!pendingIntent) return;
        if (!liveKey || !socketRef.current) return;
        if (socketUnhealthy || attemptingReconnect) return;
        if (pendingIntent.meetingId !== currentMeetingId) return;

        // Exhaustive switch — adding a new PendingIntent variant without a case
        // here is a compile error, forcing timing logic for every new feature.
        const intent: PendingIntent = pendingIntent;
        switch (intent.kind) {
            case "raise-hand": {
                // Precondition: server has not already processed the raise (no
                // trailing awaiting_* or invitation on the conversation).
                const lastMsg = textMessages[textMessages.length - 1];
                const serverAlreadyAwaiting =
                    lastMsg?.type === "awaiting_human_question" ||
                    lastMsg?.type === "awaiting_human_panelist" ||
                    lastMsg?.type === "invitation";
                if (serverAlreadyAwaiting) {
                    // Fulfilled: clear on observed outcome, not at emit time.
                    // Clearing here (rather than right before the emit below)
                    // means a raise_hand lost to a disconnect between emit and
                    // ack keeps its intent alive to retry on the next
                    // reconcile pass, instead of depending on socket.io's
                    // sendBuffer replay to resurrect it.
                    clearPendingIntent("raise-hand");
                    return;
                }

                socketRef.current.emit("raise_hand", {
                    humanName: intent.humanName,
                    index: intent.index,
                });
                break;
            }
            case "human-draft": {
                // Precondition (inverse of raise-hand): the awaiting sentinel this
                // draft answers must still be there. Checked against the captured
                // index rather than the array end, so it survives the invitation
                // being skipped/replayed ahead of it.
                const expectedType =
                    intent.mode === "panelist" ? "awaiting_human_panelist" : "awaiting_human_question";
                const awaitingMsg = textMessages[intent.index];
                if (awaitingMsg?.type !== expectedType) {
                    // Fulfilled: either the original submit already landed (the
                    // common case — this fires on the very next pass after
                    // performHumanSubmit's own local truncation), or the
                    // conversation moved on for another reason (skip/abandon).
                    clearPendingIntent("human-draft");
                    return;
                }

                // Still awaiting at the captured position — the original submit
                // never reached the server (lost to a disconnect). Wait for
                // councilState to catch back up to human_input/human_panelist
                // before auto-submitting, so we never submit underneath a
                // still-replaying invitation.
                const expectedState = intent.mode === "panelist" ? "human_panelist" : "human_input";
                if (councilState !== expectedState) return;

                performHumanSubmit(intent.text, intent.mode, intent.speaker);
                break;
            }
            case "resolve-extension": {
                // Precondition (same shape as human-draft): the query_extension
                // sentinel this choice resolves must still be there, checked
                // against the captured index.
                const sentinelMsg = textMessages[intent.index];
                if (sentinelMsg?.type !== "query_extension") {
                    // Fulfilled: either the original choice already landed (the
                    // common case — fires on the next pass after
                    // performResolveExtension's own local truncation), or the
                    // conversation moved on for another reason.
                    clearPendingIntent("resolve-extension");
                    return;
                }

                // Still there — the original choice never reached the server
                // (lost to a disconnect). Wait for councilState to catch back up
                // to query_extension before re-firing.
                if (councilState !== "query_extension") return;

                performResolveExtension(intent.choice, intent.date);
                break;
            }
            case "skip-turn": {
                // Precondition (same shape as human-draft): the awaiting sentinel
                // this skip resolves must still be there, checked against the
                // captured index.
                const expectedType =
                    intent.mode === "panelist" ? "awaiting_human_panelist" : "awaiting_human_question";
                const awaitingMsg = textMessages[intent.index];
                if (awaitingMsg?.type !== expectedType) {
                    // Fulfilled: either the original skip already landed (the
                    // common case — fires on the next pass after
                    // performSkipTurn's own local truncation), or the
                    // conversation moved on for another reason.
                    clearPendingIntent("skip-turn");
                    return;
                }

                // Still awaiting at the captured position — the original skip
                // never reached the server (lost to a disconnect). Unlike
                // human-draft, councilState can't be trusted to catch back up to
                // human_input/human_panelist on its own here: performSkipTurn's
                // direct call already pushed a local "skipped" placeholder and
                // the (separate, pre-existing) "step past a skipped message"
                // progression already moved playNextIndex beyond it — so when
                // the server's resend restores the original, unprocessed,
                // shorter conversation, playNextIndex points past its only
                // remaining element. Force it back to the captured sentinel
                // first; the state machine then re-derives councilState from
                // there exactly as it would on a fresh arrival.
                if (playNextIndex !== intent.index) {
                    setPlayNextIndex(intent.index);
                    return;
                }

                const expectedState = intent.mode === "panelist" ? "human_panelist" : "human_input";
                if (councilState !== expectedState) return;

                performSkipTurn(intent.speaker);
                break;
            }
        }
    }, [pendingIntent, socketUnhealthy, attemptingReconnect, currentMeetingId, textMessages, liveKey, councilState, playNextIndex]);

    // Deferred connection error: only surface the overlay when the machine is actually stuck
    // waiting for server data. While the council plays through buffered audio the overlay stays
    // hidden, even though the socket is unhealthy. onConnect clears the store immediately so
    // the overlay disappears as soon as the socket recovers, without waiting for a render cycle.
    useEffect(() => {
        if (!liveKey || !socketUnhealthy) return;
        const blocked = councilState === 'loading' && !tryToFindTextAndAudio();
        setConnectionError("socket", blocked);
    }, [councilState, textMessages, audioMessages, playNextIndex, liveKey, socketUnhealthy]);

    // Auto-pause / auto-resume for meeting playback (split into three effects).
    //
    // Council overlays (name, overlay council states) pause on show; dismissing without acting stays paused.
    //
    // Environmental interrupts (hash overlays, tab hidden, socket drop) also pause automatically.
    // Resume rules:
    // - Web: reconnect only (play button handles hash dismiss etc.).
    // - Museum: resume when all environmental interrupts are gone (controls are hidden).

    useEffect(() => {
        const overlayPause = visibleOverlay !== null && visibleOverlay !== "summary";
        const hashPause = Boolean(location.hash);
        const connectionPause = connectionError;
        const visibilityPause = !isDocumentVisible && metaAgentPhase === "inactive";

        if ((overlayPause || hashPause || connectionPause || visibilityPause) && !isPaused) {
            setPaused(true);
        }
    }, [
        isPaused,
        visibleOverlay,
        location.hash,
        connectionError,
        isDocumentVisible,
        metaAgentPhase,
        setPaused,
    ]);

    // Museum resume: environmental interrupts only. Overlay dismiss (X) must not
    // auto-resume, but pausing overlays (incomplete, name, query_extension in web) must
    // block resume — otherwise isPaused oscillates with the overlay-pause effect above.
    useEffect(() => {
        if (!isMuseumMode || !isPaused) {
            return;
        }

        const overlayBlocksResume =
            visibleOverlay !== null && visibleOverlay !== "summary";
        if (overlayBlocksResume) {
            return;
        }

        const hashPause = Boolean(location.hash);
        const connectionPause = connectionError;
        const visibilityPause = !isDocumentVisible && metaAgentPhase === "inactive";
        if (hashPause || connectionPause || visibilityPause) {
            return;
        }

        setPaused(false);
    }, [
        location.hash,
        connectionError,
        isDocumentVisible,
        metaAgentPhase,
        isMuseumMode,
        isPaused,
        visibleOverlay,
        setPaused,
    ]);

    // Web reconnect resume: only connectionError in deps so manual pause does not re-trigger this.
    useEffect(() => {
        if (isPaused && !connectionError) {
            setPaused(false);
        }
        // isPaused intentionally omitted — only resume when connectionError transitions.
    }, [connectionError, setPaused]);

    useEffect(() => {
        if (councilState === 'waiting') {
            if (isPaused) {
                if (waitTimer.current) clearTimeout(waitTimer.current);
                waitTimer.current = null;
            } else {
                setCouncilState('playing');
            }
        }
    }, [isPaused]);


    // Mute Logic
    const [isMuted, setIsMuted] = useState(false);
    function toggleMute() {
        setIsMuted(!isMuted);
    }

    return {
        state: {
            councilState,
            textMessages,
            audioMessages,
            playingNowIndex,
            playNextIndex,
            visibleOverlay,
            meetingElsewhere,
            nameOverlayOpen,
            summary,
            isRaisedHand,
            currentMeetingId,
            canGoBack,
            canGoForward,
            canRaiseHand,
            currentSnippetIndex,
            isMuted,
        },
        actions: {
            tryToFindTextAndAudio,
            handleOnFinishedPlaying,
            handleOnSkipBackward,
            handleOnSkipForward,
            handleOnSubmitHumanMessage,
            handleOnAbandonHumanTurn,
            handleOnExtendMeeting,
            handleOnAttemptResume,
            handleOnConcludeMeeting,
            handleHumanNameEntered,
            handleOnRaiseHand,
            declineOverlay,
            setIsRaisedHand,
            setCurrentSnippetIndex,
            toggleMute
        },
        socketRef
    };
}

