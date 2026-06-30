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

    // Connection variables
    const [attemptingReconnect, setAttemptingReconnect] = useState(false);

    // Limits
    const [maximumPlayedIndex, setMaximumPlayedIndex] = useState(0);

    // States from lower down (Snippet management)
    const [currentSnippetIndex, setCurrentSnippetIndex] = useState(0);

    // Routing
    const location = useLocation();

    // Refs
    const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const maximumPlayedProgressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    /* -------------------------------------------------------------------------- */
    /*                             Socket & Startup                               */
    /* -------------------------------------------------------------------------- */
    const socketRef = useCouncilSocket({
        meetingId: currentMeetingId,
        liveKey,
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
            setConnectionError("socket", true);
        },
        onConnect: () => {
            setConnectionError("socket", false);
        },
        onReconnect: () => {
            setAttemptingReconnect(true);
        }
    });

    // Reconnect logic
    useEffect(() => {
        if (attemptingReconnect && socketRef.current && currentMeetingId > 0 && liveKey) {
            socketRef.current.emit("attempt_reconnection", {
                meetingId: currentMeetingId,
                liveKey,
                handRaised: isRaisedHand,
            });
            setAttemptingReconnect(false);
        } else if (attemptingReconnect) {
            setAttemptingReconnect(false);
        }
    }, [attemptingReconnect, liveKey, currentMeetingId, isRaisedHand]);

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

        // This will be triggered directly when text is set
        if (councilState !== 'summary' && textMessages[playNextIndex]?.type === 'summary') {
            setCouncilState("summary");
            return;
        }

        //If we have reached a meeting incomplete message
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
    }, [councilState, textMessages, audioMessages, playingNowIndex, playNextIndex, liveKey, summary, initialLoadingMinElapsed, isMuseumMode, agentMode, setMetaAgentPhase]);

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

            if (socketRef.current) socketRef.current.emit("submit_human_panelist", { text: newTopic, speaker: pendingMessage.speaker });

            const now = textMessages[playingNowIndex]?.type === 'invitation' ? playingNowIndex - 1 : playingNowIndex;
            const next = textMessages[playingNowIndex]?.type === 'invitation' ? playNextIndex - 1 : playNextIndex;
            setTextMessages((prevMessages) => prevMessages.slice(0, next));
            setPlayingNowIndex(now);
            setPlayNextIndex(next);
            calculateNextAction();
        } else {
            if (socketRef.current) socketRef.current.emit("submit_human_message", { text: newTopic });

            const now = textMessages[playingNowIndex].type === 'invitation' ? playingNowIndex - 1 : playingNowIndex;
            const next = textMessages[playingNowIndex].type === 'invitation' ? playNextIndex - 1 : playNextIndex;
            setTextMessages((prevMessages) => {
                return prevMessages.slice(0, now);
            });

            setPlayingNowIndex(now);
            setPlayNextIndex(next);
            setIsRaisedHand(false);
            calculateNextAction();
        }
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

        if (socketRef.current) socketRef.current.emit("skip_human_turn");

        const speaker =
            awaitingMsg.type === "awaiting_human_panelist" ? awaitingMsg.speaker : humanName;

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
        calculateNextAction();
    }

    function declineOverlay() {
        if (nameOverlayOpen) {
            setNameOverlayOpen(false);
            return;
        }
        rewindOverlayCouncilState(councilState);
    }

    function handleOnExtendMeeting() {
        const queryExtensionIndex = textMessages.findIndex((m) => m.type === 'query_extension');
        setTextMessages(prevMessages => prevMessages.slice(0, queryExtensionIndex));
        setPaused(false);
        if (socketRef.current) socketRef.current.emit("extend_meeting");
        setCouncilState('loading');
    }

    function handleOnConcludeMeeting() {
        const queryExtensionIndex = textMessages.findIndex((m) => m.type === 'query_extension');
        setTextMessages(prevMessages => prevMessages.slice(0, queryExtensionIndex));
        setPaused(false);
        const browserDate = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        if (socketRef.current) socketRef.current.emit("conclude_meeting", { date: browserDate });
        setCouncilState('loading');
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
            setUnrecoverableError({
                message: msg,
                source: "useCouncilMachine.resume",
                cause: err,
                meetingId: currentMeetingId,
            });
        }
    }


    function handleHumanNameEntered(input: { humanName: string }) {
        if (input.humanName) {
            setHumanName(input.humanName);
            setIsRaisedHand(true);
            setPaused(false);
            setNameOverlayOpen(false);
        }
    }

    function handleOnRaiseHand() {
        if (humanName === "") {
            setNameOverlayOpen(true);
        } else {
            setIsRaisedHand(true);
        }
    }

    // Furthest playback index (UI + replay cap): bump state when `playingNowIndex` advances,
    // then debounce socket `report_maximum_played_index` with `furthest = max(state, current)`.
    // Single effect avoids one-render lag between two separate `useEffect`s on the same turn.
    useEffect(() => {
        if (!liveKey || !socketRef.current || currentMeetingId <= 0) {
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
        // Summary is a special case when we should increase the counter directly when text arrives
        const summaryIndex = textMessages.findIndex((message) => message.type === 'summary');
        const furthest = Math.min(maxLocalIndex, Math.max(maximumPlayedIndex, playingNowIndex, summaryIndex));
        if (maximumPlayedProgressTimer.current !== null) {
            clearTimeout(maximumPlayedProgressTimer.current);
        }
        maximumPlayedProgressTimer.current = setTimeout(() => {
            maximumPlayedProgressTimer.current = null;
            socketRef.current?.emit("report_maximum_played_index", { index: furthest });
        }, 400);
        return () => {
            if (maximumPlayedProgressTimer.current !== null) {
                clearTimeout(maximumPlayedProgressTimer.current);
                maximumPlayedProgressTimer.current = null;
            }
        };
    }, [playingNowIndex, maximumPlayedIndex, liveKey, currentMeetingId, summary, textMessages]);

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
        setCanRaiseHand(
            (councilState === 'playing' || councilState === 'waiting') &&
            playingNowIndex === maximumPlayedIndex
        );
    }, [councilState, playingNowIndex, maximumPlayedIndex, liveKey]);

    // Raise Hand Effect
    useEffect(() => {
        if (isRaisedHand) {
            if (socketRef.current) {
                socketRef.current.emit("raise_hand", {
                    humanName: humanName,
                    index: playingNowIndex + 1,
                });
            }
            setTextMessages((prevMessages) => {
                return prevMessages.slice(0, playingNowIndex + 1);
            });
        }
    }, [isRaisedHand]);

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

    // Museum resume: only environmental deps — visibleOverlay omitted so overlay dismiss (X)
    // does not trigger auto-resume. Stacked interrupts (e.g. #setup + hidden tab) resume only
    // when hash, connection, and visibility are all clear again.
    useEffect(() => {
        if (!isMuseumMode || !isPaused) {
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

