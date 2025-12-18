import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router"; // react-router-dom in this project?
import { useCouncilSocket } from "../hooks/useCouncilSocket";
import { Character, ConversationMessage, Sentence } from "@shared/ModelTypes";
import { AudioUpdatePayload } from "@shared/SocketTypes";
// @ts-ignore
import globalOptions from "@/global-options-client.json";

export interface DecodedAudioMessage extends Omit<AudioUpdatePayload, 'audio'> {
    audio: AudioBuffer;
}

export interface UseCouncilMachineProps {
    lang: string;
    topic: { prompt: string;[key: string]: any };
    participants: Character[];
    audioContext: React.MutableRefObject<AudioContext | null>;
    setUnrecoverableError: (error: boolean) => void;
    setConnectionError: (error: boolean) => void;
    connectionError: boolean;
    isPaused: boolean;
    setPaused: (paused: boolean) => void;
    setAudioPaused?: (paused: boolean) => void;
    baseUrl: string; // Base URL for meeting routes (e.g. "/meeting" or "/en/meeting")
}

export function useCouncilMachine({
    lang,
    topic,
    participants,
    audioContext,
    setUnrecoverableError,
    setConnectionError,
    connectionError,
    isPaused,
    setPaused,
    setAudioPaused,
    baseUrl
}: UseCouncilMachineProps) {

    /* -------------------------------------------------------------------------- */
    /*                             Main State Variables                           */
    /* -------------------------------------------------------------------------- */
    // The finite state machine for the meeting: 'loading' | 'playing' | 'waiting' | 'human_input' | 'human_panelist' | 'summary' | 'max_reached'
    const [councilState, setCouncilState] = useState("loading");
    const [playingNowIndex, setPlayingNowIndex] = useState(-1);
    const [playNextIndex, setPlayNextIndex] = useState(0);

    const [textMessages, setTextMessages] = useState<ConversationMessage[]>([]); // State to store conversation updates
    const [audioMessages, setAudioMessages] = useState<DecodedAudioMessage[]>([]); // To store multiple ArrayBuffers
    const [activeOverlay, setActiveOverlay] = useState<"name" | "completed" | "summary" | null>(null);
    const [summary, setSummary] = useState<ConversationMessage | null>(null);

    const [humanName, setHumanName] = useState("");
    const [isRaisedHand, setIsRaisedHand] = useState(false);

    // Connection variables
    const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);
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
    const waitTimer = useRef<NodeJS.Timeout | null>(null);

    // Derived State
    const [canGoBack, setCanGoBack] = useState(false);
    const [canGoForward, setCanGoForward] = useState(false);
    const [canRaiseHand, setCanRaiseHand] = useState(false);

    /* -------------------------------------------------------------------------- */
    /*                             Socket & Startup                               */
    /* -------------------------------------------------------------------------- */
    const socketRef = useCouncilSocket({
        topic,
        participants,
        lang,
        onMeetingStarted: (meeting) => {
            setCurrentMeetingId(String(meeting.meeting_id));
            navigate(`${baseUrl}/${meeting.meeting_id}`);
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
        if (attemptingReconnect && currentMeetingId && socketRef.current) {
            socketRef.current.emit("attempt_reconnection", {
                meetingId: currentMeetingId,
                handRaised: isRaisedHand,
                conversationMaxLength: meetingMaxLength
            });
            setConnectionError(false);
            setAttemptingReconnect(false);
        }
    }, [attemptingReconnect, currentMeetingId]);

    /* -------------------------------------------------------------------------- */
    /*                               Helpers                                      */
    /* -------------------------------------------------------------------------- */

    /**
     * Checks if the required text and audio data for the `playNextIndex` are available in local state.
     */
    function tryToFindTextAndAudio() {
        let textMessage = textMessages[playNextIndex];
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
        //In all cases accept if we are still waiting, clear the wait timer on state change
        if (councilState !== 'waiting' && waitTimer.current) {
            clearTimeout(waitTimer.current);
            waitTimer.current = null;
        }

        // This will be triggered directly when text is set
        if (councilState !== 'summary' && textMessages[playNextIndex]?.type === 'summary') {
            setCouncilState("summary");
            return;
        }

        //If we have reached a human panelist
        if (councilState !== 'human_panelist' && textMessages[playNextIndex]?.type === 'awaiting_human_panelist') {
            setCouncilState('human_panelist');
            return;
        }

        //If we have reached a human question
        if (councilState !== 'human_input' && textMessages[playNextIndex]?.type === 'awaiting_human_question') {
            setCouncilState('human_input');
            return;
        }

        //If message is skipped
        if (textMessages[playNextIndex]?.type === 'skipped') {
            console.log(`[warning] skipped speaker ${textMessages[playNextIndex].speaker}`);
            setPlayNextIndex(current => current + 1);
            return;
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
                    setCouncilState('playing');
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
    }, [councilState, textMessages, audioMessages, playingNowIndex, playNextIndex, activeOverlay]);

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

            if (socketRef.current) socketRef.current.emit("submit_human_panelist", { text: newTopic, speaker: actualSpeaker });

            //Slice off the waiting for panelist
            setTextMessages((prevMessages) => {
                return prevMessages.slice(0, playNextIndex);
            });
            calculateNextAction();
        } else {
            if (socketRef.current) socketRef.current.emit("submit_human_message", { text: newTopic, speaker: humanName, askParticular: askParticular });

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
        navigate(`${baseUrl}/${(currentMeetingId || "new")}`);

        if (councilState === 'max_reached') {
            setPlayNextIndex(meetingMaxLength - 1);
            setCouncilState('playing');
        } else if (councilState === 'summary') {
            setPlayNextIndex(meetingMaxLength - 2);
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

    function handleHumanNameEntered(input: any) {
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

    // Update Max Played
    useEffect(() => {
        if (playingNowIndex > maximumPlayedIndex) {
            setMaximumPlayedIndex(playingNowIndex);
        }
    }, [playingNowIndex]);

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
        setCanRaiseHand(
            (councilState === 'playing' || councilState === 'waiting') &&
            playingNowIndex === maximumPlayedIndex &&
            playingNowIndex !== meetingMaxLength - 1
        );
    }, [councilState, playingNowIndex, meetingMaxLength, maximumPlayedIndex]);

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

    const canExtendMeeting = meetingMaxLength < globalOptions.meetingVeryMaxLength;


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

