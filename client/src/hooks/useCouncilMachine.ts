import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router";
import { useCouncilSocket } from "../hooks/useCouncilSocket";
import { useRouting } from "@/routing";
import type { Character, Message, Meeting, Topic } from "@shared/ModelTypes";
import type { PublicAudioClipResponse, DecodedAudioMessage } from "@shared/SocketTypes";
import globalOptions from "@/global-options-client.json";
import { CouncilOverlayType } from "@/components/CouncilOverlays";
import { resumeMeeting } from "@/api/resumeMeeting";

export interface UseCouncilMachineProps {
    currentMeetingId: number;
    creatorKey: string | undefined;
    setCreatorKey: (key: string) => void;
    replayManifest: Meeting | null;
    topic: Topic | null;
    participants: Character[] | null;
    audioContext: React.MutableRefObject<AudioContext | null>;
    setUnrecoverableError: (error: boolean) => void;
    setConnectionError: (error: boolean) => void;
    connectionError: boolean;
    isPaused: boolean;
    setPaused: (paused: boolean) => void;
    setAudioPaused?: (paused: boolean) => void;
}

export function useCouncilMachine({
    currentMeetingId,
    creatorKey,
    setCreatorKey,
    replayManifest,
    topic: _topic,
    participants: _participants,
    audioContext,
    setUnrecoverableError,
    setConnectionError,
    connectionError,
    isPaused,
    setPaused,
    setAudioPaused,
}: UseCouncilMachineProps) {

    const { meetingRoutesBase } = useRouting();

    /* -------------------------------------------------------------------------- */
    /*                             Main State Variables                           */
    /* -------------------------------------------------------------------------- */
    // The finite state machine for the meeting: 'loading' | 'playing' | 'waiting' | 'human_input' | 'human_panelist' | 'summary' | 'max_reached'
    const [councilState, setCouncilState] = useState("loading");
    const [playingNowIndex, setPlayingNowIndex] = useState(-1);
    const [playNextIndex, setPlayNextIndex] = useState(0);

    const [textMessages, setTextMessages] = useState<Message[]>([]); // State to store conversation updates
    const [audioMessages, setAudioMessages] = useState<DecodedAudioMessage[]>([]); // To store multiple ArrayBuffers
    const [activeOverlay, setActiveOverlay] = useState<CouncilOverlayType | null>(null);
    const [summary, setSummary] = useState<Message | null>(null);

    const [humanName, setHumanName] = useState("");
    const [isRaisedHand, setIsRaisedHand] = useState(false);

    // Connection variables
    const [attemptingReconnect, setAttemptingReconnect] = useState(false);

    // Limits
    const [maximumPlayedIndex, setMaximumPlayedIndex] = useState(0);
    const [meetingMaxLength, setMeetingMaxLength] = useState(globalOptions.conversationMaxLength);

    // States from lower down (Snippet management)
    const [currentSnippetIndex, setCurrentSnippetIndex] = useState(0);
    const [sentencesLength, setSentencesLength] = useState(10);

    // Routing
    const navigate = useNavigate();
    const location = useLocation();

    // Refs
    const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const maximumPlayedProgressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Derived State
    const [canGoBack, setCanGoBack] = useState(false);
    const [canGoForward, setCanGoForward] = useState(false);
    const [canRaiseHand, setCanRaiseHand] = useState(false);

    /* -------------------------------------------------------------------------- */
    /*                             Socket & Startup                               */
    /* -------------------------------------------------------------------------- */
    const socketRef = useCouncilSocket({
        meetingId: currentMeetingId,
        creatorKey,
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
            setUnrecoverableError(true);
        },
        onConnectionError: (err) => {
            console.error(err);
            setConnectionError(true);
        },
        onReconnect: () => {
            setAttemptingReconnect(true);
        }
    });

    // Reconnect logic
    useEffect(() => {
        if (attemptingReconnect && socketRef.current && currentMeetingId > 0 && creatorKey) {
            socketRef.current.emit("attempt_reconnection", {
                meetingId: currentMeetingId,
                creatorKey,
                handRaised: isRaisedHand,
                conversationMaxLength: meetingMaxLength
            });
            setConnectionError(false);
            setAttemptingReconnect(false);
        } else if (attemptingReconnect) {
            setAttemptingReconnect(false);
        }
    }, [attemptingReconnect, creatorKey, currentMeetingId, isRaisedHand, meetingMaxLength]);

    const decodeReplayClip = useCallback(
        async (audioId: string, signal: AbortSignal): Promise<DecodedAudioMessage> => {
            const res = await fetch(`/api/audio/${encodeURIComponent(audioId)}`, {
                method: "GET",
                headers: { Accept: "application/json" },
                signal,
            });
            if (!res.ok) {
                throw new Error(`Replay audio fetch failed (${res.status})`);
            }
            const clip = (await res.json()) as PublicAudioClipResponse;
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
                setUnrecoverableError(true);
                console.error("Audio download error", e);
            }
        }
    }

    // Replay startup logic
    useEffect(() => {
        if (creatorKey || !replayManifest) {
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
    }, [creatorKey, replayManifest]);

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
            if (playingNowIndex + 1 < meetingMaxLength) {
                setPlayNextIndex(playingNowIndex + 1);
                if (wait) {
                    setCouncilState('waiting');
                } else {
                    setCouncilState('playing');
                }
            } else {
                setCouncilState('max_reached');
            }
        }
    }, [councilState, playingNowIndex, meetingMaxLength]);

    /* -------------------------------------------------------------------------- */
    /*                          Main State Machine Logic                          */
    /* -------------------------------------------------------------------------- */
    useEffect(() => {
        //In all cases except if we are still waiting, clear the wait timer on state change
        if (councilState !== 'waiting' && waitTimer.current) {
            clearTimeout(waitTimer.current);
            waitTimer.current = null;
        }

        // This will be triggered directly when text is set
        if (councilState !== 'summary' && textMessages[playNextIndex]?.type === 'summary') {
            setCouncilState("summary");
            return;
        }

        //If message is skipped
        if (textMessages[playNextIndex]?.type === 'skipped') {
            console.log(`[warning] skipped speaker ${textMessages[playNextIndex].speaker}`);
            setPlayNextIndex(current => current + 1);
            return;
        }

        //If we have reached a meeting incomplete message
        if (councilState !== 'meeting_incomplete' && textMessages[playNextIndex]?.type === 'meeting_incomplete') {
            setCouncilState('meeting_incomplete');
            return;
        }

        //Live only states
        if (creatorKey) {

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

        }


        switch (councilState) {
            case 'loading':
                if (tryToFindTextAndAudio()) {
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
                if (activeOverlay !== "incomplete") {
                    setActiveOverlay("incomplete");
                }
                if (textMessages[playNextIndex]?.type !== 'meeting_incomplete') {
                    removeOverlay();
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
                if (activeOverlay === null) {
                    setActiveOverlay("summary");
                }
                if (textMessages[playNextIndex]?.type !== 'summary') {
                    removeOverlay();
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
            case 'max_reached':
                // Wait for transition effect?
                if (activeOverlay !== "completed") {
                    setActiveOverlay("completed");
                }
                break;
            default:
                break;
        }
    }, [councilState, textMessages, audioMessages, playingNowIndex, playNextIndex, activeOverlay, creatorKey, summary]);

    /* -------------------------------------------------------------------------- */
    /*                                 Actions                                    */
    /* -------------------------------------------------------------------------- */

    function handleOnFinishedPlaying() {
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

    function handleOnSubmitHumanMessage(newTopic: string, askParticular: string) {
        // NOTE: Logic copied from upstream, but we need to check if we need special handling here
        if (councilState === 'human_panelist') {
            // Logic fix: currentSpeakerId logic was handled in Component view in Upstream, but ideally logic is here
            // BUT wait, in Upstream, currentSpeakerId was derived state in the component.
            // Here we don't have currentSpeakerId unless we pass it or derive it.
            // The logic says: use pendingMessage.speaker.
            const pendingMessage = textMessages[playNextIndex];
            const actualSpeaker = (pendingMessage?.type === 'awaiting_human_panelist') ? pendingMessage.speaker : ""; // Fallback?

            if (socketRef.current) socketRef.current.emit("submit_human_panelist", { type: "panelist", text: newTopic, speaker: actualSpeaker });

            //Slice off the waiting for panelist
            setTextMessages((prevMessages) => {
                return prevMessages.slice(0, playNextIndex);
            });
            calculateNextAction();
        } else {
            if (socketRef.current) socketRef.current.emit("submit_human_message", { type: "human", text: newTopic, speaker: humanName, askParticular: askParticular });

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

    function removeOverlay() {
        setActiveOverlay(null);

        // Are these actually needed?
        const pathSuffix = currentMeetingId > 0 ? String(currentMeetingId) : "new";
        const pathname = `${meetingRoutesBase}/${pathSuffix}`;
        navigate({ pathname, hash: "" }, { replace: true });

        if (councilState === 'max_reached') {
            setPlayNextIndex(meetingMaxLength - 1);
            setCouncilState('playing');
        } else if (councilState === 'summary') {
            setPlayNextIndex(meetingMaxLength - 2);
            setCouncilState('playing');
        } else if (councilState === 'meeting_incomplete') {
            setPlayNextIndex(playNextIndex - 1);
            setCouncilState('playing');
        }
    }

    function handleOnContinueMeetingLonger() {
        removeOverlay();
        setPlayNextIndex(meetingMaxLength);
        setMeetingMaxLength((prev) => prev + globalOptions.extraMessageCount);
        setPaused(false);
        if (socketRef.current) socketRef.current.emit("continue_conversation");
    }

    function handleOnGenerateSummary() {
        removeOverlay();
        setMeetingMaxLength((prev) => prev + 1);
        setPlayNextIndex(meetingMaxLength);
        const browserDate = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        if (socketRef.current) socketRef.current.emit("wrap_up_meeting", { date: browserDate });
        setCouncilState('loading');
    }

    /**
     * PUT `/api/meetings/:id` → rotate `creatorKey`, reconcile the local replay buffer
     * against the server's sanitized conversation, then hand over to the live socket
     * by calling the lifted `setCreatorKey`. See Phase 9 of the replay/live doc.
     */
    async function handleOnAttemptResume() {

        // strip the meeting_incomplete message
        const meetingIncompleteIndex = textMessages.findIndex((message) => message.type === 'meeting_incomplete');
        if (meetingIncompleteIndex !== -1) {
            setTextMessages((prevMessages) => prevMessages.slice(0, meetingIncompleteIndex));
        }

        // Go to loading state, and remove the overlay once the state is set
        setCouncilState(("loading"));
        removeOverlay();


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
            setCreatorKey(response.creatorKey);
        } catch (err) {
            setUnrecoverableError(true);
        }
    }


    function handleHumanNameEntered(input: { humanName: string }) {
        if (input.humanName) {
            setHumanName(input.humanName);
            setIsRaisedHand(true);
            setPaused(false);
            removeOverlay();
        }
    }

    function handleOnRaiseHand() {
        if (humanName === "") {
            setActiveOverlay("name");
        } else {
            setIsRaisedHand(true);
        }
    }

    // Furthest playback index (UI + replay cap): bump state when `playingNowIndex` advances,
    // then debounce socket `report_maximum_played_index` with `furthest = max(state, current)`.
    // Single effect avoids one-render lag between two separate `useEffect`s on the same turn.
    useEffect(() => {
        if (!creatorKey || !socketRef.current || currentMeetingId <= 0) {
            return;
        }
        if (playingNowIndex < 0) {
            return;
        }
        if (playingNowIndex > maximumPlayedIndex) {
            setMaximumPlayedIndex(playingNowIndex);
        }
        // Summary is a special case when we should increase the counter directly when text arrives
        const summaryIndex = textMessages.findIndex((message) => message.type === 'summary');
        const furthest = Math.max(maximumPlayedIndex, playingNowIndex, summaryIndex);
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
    }, [playingNowIndex, maximumPlayedIndex, creatorKey, currentMeetingId, summary]);

    // Update canGoBack etc
    useEffect(() => {
        setCanGoBack(
            (councilState === 'playing' ||
                councilState === 'waiting' ||
                councilState === 'summary') &&
            playingNowIndex !== 0
        );
        setCanGoForward(
            (councilState === 'playing' || councilState === 'waiting') &&
            playingNowIndex < meetingMaxLength
        );
        if (!creatorKey) {
            setCanRaiseHand(false);
            return;
        }
        setCanRaiseHand(
            (councilState === 'playing' || councilState === 'waiting') &&
            playingNowIndex === maximumPlayedIndex &&
            playingNowIndex !== meetingMaxLength - 1
        );
    }, [councilState, playingNowIndex, meetingMaxLength, maximumPlayedIndex, creatorKey]);

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

    // Pause Logic
    useEffect(() => {
        if (activeOverlay !== null && activeOverlay !== "summary" && !isPaused) {
            setPaused(true);
        } else if (location.hash && !isPaused) {
            setPaused(true);
        } else if (connectionError) {
            setPaused(true);
        }

        // Audio Context Suspension
        if (isPaused) {
            if (setAudioPaused) {
                setAudioPaused(true);
            } else if (audioContext.current && audioContext.current.state !== "suspended") {
                audioContext.current.suspend();
            }
        } else {
            if (setAudioPaused) {
                setAudioPaused(false);
            } else if (audioContext.current && audioContext.current.state === "suspended") {
                audioContext.current.resume();
            }
        }
    }, [isPaused, activeOverlay, location, connectionError, setAudioPaused, councilState]);

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

    const canExtendMeeting = (creatorKey !== undefined) && meetingMaxLength < globalOptions.meetingVeryMaxLength;


    return {
        state: {
            councilState,
            textMessages,
            audioMessages,
            playingNowIndex,
            playNextIndex,
            activeOverlay,
            summary,
            humanName,
            isRaisedHand,
            currentMeetingId,
            canGoBack,
            canGoForward,
            canRaiseHand,
            currentSnippetIndex,
            sentencesLength,
            isMuted,
            canExtendMeeting,
        },
        actions: {
            tryToFindTextAndAudio,
            handleOnFinishedPlaying,
            handleOnSkipBackward,
            handleOnSkipForward,
            handleOnSubmitHumanMessage,
            handleOnContinueMeetingLonger,
            handleOnAttemptResume,
            handleOnGenerateSummary,
            handleHumanNameEntered,
            handleOnRaiseHand,
            removeOverlay,
            setHumanName,
            setIsRaisedHand,
            setCurrentSnippetIndex,
            setSentencesLength,
            toggleMute
        },
        socketRef
    };
}

