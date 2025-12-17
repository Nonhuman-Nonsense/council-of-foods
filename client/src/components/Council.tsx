import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router";
import io from "socket.io-client";
import Overlay from "./Overlay";
import CouncilOverlays from "./CouncilOverlays";
import Loading from "./Loading";
import Output from "./Output";
import ConversationControls from "./ConversationControls";
import HumanInput from "./HumanInput";
import { useDocumentVisibility, mapFoodIndex } from "@/utils";

// @ts-ignore
import globalOptions from "@/global-options-client.json";
import { useCouncilSocket } from "@/hooks/useCouncilSocket";
import { Character, ConversationMessage, Sentence } from "@shared/ModelTypes";
import { AudioUpdatePayload } from "@shared/SocketTypes";

interface CouncilProps {
  lang: string;
  topic: { prompt: string;[key: string]: any };
  participants: Character[];
  setUnrecoverableError: (error: boolean) => void;
  setConnectionError: (error: boolean) => void;
  connectionError: boolean;
  // Forest-Specific Props:
  audioContext: React.MutableRefObject<AudioContext | null>;
  setAudioPaused: (paused: boolean) => void;
  currentSpeakerId: string;
  setCurrentSpeakerId: (id: string) => void;
  isPaused: boolean;
  setPaused: (paused: boolean) => void;
}

export interface DecodedAudioMessage {
  id: string;
  audio: AudioBuffer;
  sentences?: Sentence[];
}

/**
 * Council Component
 * 
 * The central component for the meeting interface.
 * It manages the conversation state machine, audio playback, socket communication,
 * and orchestrates the visual representation of the meeting (foods, subtitles, backgrounds).
 * 
 * Core Logic:
 * - Uses `useCouncilSocket` to receive text/audio updates from the server.
 * - Maintains a "Playing Cursor" (`playingNowIndex`) which tracks the currently active message.
 * - Maintains a "Next Cursor" (`playNextIndex`) which tracks the target message to play next.
 * - The `useEffect` [Main State] drives valid transitions between `loading`, `playing`, `waiting`, etc.
 */
function Council({
  lang,
  topic,
  participants,
  currentSpeakerId,
  setCurrentSpeakerId,
  isPaused,
  setPaused,
  setUnrecoverableError,
  setConnectionError,
  connectionError,
  audioContext,
  setAudioPaused
}: CouncilProps) {
  //Overall Council settings for this meeting
  const [humanName, setHumanName] = useState("");

  //Humans and foods
  const foods = participants.filter((part) => part.type !== 'panelist');


  /* -------------------------------------------------------------------------- */
  /*                             Connection & Routing                           */
  /* -------------------------------------------------------------------------- */

  // Connection variables
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null);
  const [attemptingReconnect, setAttemptingReconnect] = useState(false);
  const isDocumentVisible = useDocumentVisibility();// If tab is not active etc

  //Routing
  const navigate = useNavigate();
  const location = useLocation();

  /* -------------------------------------------------------------------------- */
  /*                             Main State Variables                           */
  /* -------------------------------------------------------------------------- */

  const [activeOverlay, setActiveOverlay] = useState<"name" | "completed" | "summary" | null>(null);
  const [textMessages, setTextMessages] = useState<ConversationMessage[]>([]); // State to store conversation updates
  const [audioMessages, setAudioMessages] = useState<DecodedAudioMessage[]>([]); // To store multiple ArrayBuffers

  // The finite state machine for the meeting: 'loading' | 'playing' | 'waiting' | 'human_input' | 'human_panelist' | 'summary' | 'max_reached'
  const [councilState, setCouncilState] = useState("loading");

  // The index of the message currently being presented to the user (audio/text)
  const [playingNowIndex, setPlayingNowIndex] = useState(-1);

  // The index of the message we *want* to play next. This allows pre-fetching or skipping logic.
  const [playNextIndex, setPlayNextIndex] = useState(0);

  const [maximumPlayedIndex, setMaximumPlayedIndex] = useState(0); // The maximum message every played
  const [meetingMaxLength, setMeetingMaxLength] = useState(globalOptions.conversationMaxLength);

  /* -------------------------------------------------------------------------- */
  /*                                 References                                 */
  /* -------------------------------------------------------------------------- */

  const waitTimer = useRef<NodeJS.Timeout | null>(null); // The waiting timer

  /* -------------------------------------------------------------------------- */
  /*                             Secondary Controls                             */
  /* -------------------------------------------------------------------------- */

  const [isRaisedHand, setIsRaisedHand] = useState(false);
  const [isMuted, setMuteUnmute] = useState(false);

  //Automatic calculated state variables
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [canRaiseHand, setCanRaiseHand] = useState(false);

  const showControls = (
    councilState === 'playing' ||
    councilState === 'waiting' ||
    (councilState === 'summary' && tryToFindTextAndAudio())
  ) ? true : false;
  const canExtendMeeting = meetingMaxLength < globalOptions.meetingVeryMaxLength;

  //States from lower down
  const [currentSnippetIndex, setCurrentSnippetIndex] = useState(0);
  const [sentencesLength, setSentencesLength] = useState(10);
  const [summary, setSummary] = useState<ConversationMessage | null>(null);//We store the summary here for easy access


  /* -------------------------------------------------------------------------- */
  /*                             Socket & Startup                               */
  /* -------------------------------------------------------------------------- */

  // Startup and set listeners
  const socketRef = useCouncilSocket({
    topic,
    participants,
    lang,
    onMeetingStarted: (meeting) => {
      setCurrentMeetingId(String(meeting.meeting_id));
      navigate(`/${lang}/meeting/${meeting.meeting_id}`);
    },
    onAudioUpdate: (audioMessage) => {
      (async () => {
        if (audioMessage.audio && audioContext.current) {
          const buffer = await audioContext.current.decodeAudioData(
            audioMessage.audio as unknown as ArrayBuffer
          );
          const decodedMessage: DecodedAudioMessage = { ...audioMessage, audio: buffer };
          setAudioMessages((prevAudioMessages) => [
            ...prevAudioMessages,
            decodedMessage,
          ]);
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

  /* -------------------------------------------------------------------------- */
  /*                               Derived State                                */
  /* -------------------------------------------------------------------------- */
  useEffect(() => {
    // Recalculate derived state if needed or keep inline
  }, [councilState, playingNowIndex, textMessages, playNextIndex, humanName]);

  // Sync current speaker ID to parent component for Forest zoom
  useEffect(() => {
    if (playingNowIndex >= 0 && textMessages[playingNowIndex]) {
      if (textMessages[playingNowIndex].speaker) {
        setCurrentSpeakerId(textMessages[playingNowIndex].speaker.toLowerCase());
      }
    }
  }, [playingNowIndex, textMessages, setCurrentSpeakerId]);

  // If we reach the end of one message, figure out what to do next
  function calculateNextAction(wait = false) {

    if (councilState === 'human_input' || councilState === 'human_panelist') {// if human input was submitted
      setCouncilState('loading');
    } else if (councilState === 'playing' || councilState === 'waiting') {
      //If we have not reached the end of the maximum, try to go to next
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
  }


  useEffect(() => {
    // Update canGoBack etc
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


  /* -------------------------------------------------------------------------- */
  /*                                 Pause Logic                                */
  /* -------------------------------------------------------------------------- */

  //Some cases when pause should be activated
  useEffect(() => {
    if (activeOverlay !== null && activeOverlay !== "summary" && !isPaused) {
      setPaused(true);
    } else if (location.hash && !isPaused) {
      setPaused(true);
    } else if (connectionError || !isDocumentVisible) {
      setPaused(true);
    }
  }, [isPaused, activeOverlay, location, connectionError, isDocumentVisible]);

  //When pause changes, suspend audio context
  useEffect(() => {
    if (isPaused) {
      setAudioPaused(true);
    } else if (audioContext.current && audioContext.current.state === "suspended") {
      setAudioPaused(false);
    }
  }, [isPaused, councilState]);

  //Handle special case if pause is pressed while waiting
  useEffect(() => {
    if (councilState === 'waiting') {
      if (isPaused) {
        //Stop the waiting timer
        if (waitTimer.current) clearTimeout(waitTimer.current);
        waitTimer.current = null;
      } else {
        setCouncilState('playing');
      }
    }
  }, [isPaused]);

  // Reconnect logic
  useEffect(() => {
    if (attemptingReconnect && currentMeetingId) {
      socketRef.current.emit("attempt_reconnection", {
        meetingId: currentMeetingId,
        handRaised: isRaisedHand,
        conversationMaxLength: meetingMaxLength
      });
      setConnectionError(false);
      setAttemptingReconnect(false);
    }
  }, [attemptingReconnect, currentMeetingId]);

  /**
   * Main State Machine
   * Drives the council meeting forward by reacting to changes in `councilState`, `playingNowIndex`, and available data.
   * 
   * Transition Logic:
   * - `loading` -> `playing`: When text/audio for `playNextIndex` is available.
   * - `playing`: Monitors audio completion. If `playingNowIndex` != `playNextIndex`, attempts to advance.
   * - `waiting`: A brief pause between speakers (handled by `waitTimer`).
   * - `summary`: Special state for end-of-meeting summary.
   * - `human_input`: Pauses flow to accept user microphone/text input.
   */
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
        setActiveOverlay("completed");
        break;
      default:
        break;
    }
  }, [councilState, textMessages, audioMessages, playingNowIndex, playNextIndex, activeOverlay]);

  /**
   * Checks if the required text and audio data for the `playNextIndex` are available in local state.
   * @returns {boolean} True if both text and audio exist and are ready to play.
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

  // Store maximum ever played message
  useEffect(() => {
    if (playingNowIndex > maximumPlayedIndex) {
      setMaximumPlayedIndex(playingNowIndex);
    }
  }, [playingNowIndex]);


  /* -------------------------------------------------------------------------- */
  /*                               Event Handlers                               */
  /* -------------------------------------------------------------------------- */

  // Handler getting triggered when an audio message reaches the end
  function handleOnFinishedPlaying() {
    calculateNextAction(true);
  }

  /** 
   * Skips backward in the conversation history.
   * Skips over any messages marked as 'skipped' to find the previous playable segment.
   */
  function handleOnSkipBackward() {
    let skipLength = 1;
    //If trying to go back when a message was skipped
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

  // When skip forward is pressed on controls
  function handleOnSkipForward() {
    calculateNextAction();
  }

  function handleMuteUnmute() {
    setMuteUnmute(!isMuted);
  }

  /**
   * Submits a human message to the server via socket.
   * Differentiates between 'human_panelist' (interrupting) and 'human_input' (asked by system).
   * 
   * @param {string} newTopic - The text content of the user's message.
   * @param {boolean} askParticular - Flag if specific addressing is needed.
   */
  function handleOnSubmitHumanMessage(newTopic: string, askParticular: string) {
    if (councilState === 'human_panelist') {
      // Logic fix: currentSpeakerId might be pointing to the PREVIOUS speaker (because playingNowIndex hasn't advanced yet).
      // We need to grab the speaker form the 'awaiting_human_panelist' message which is likely at playNextIndex.
      const pendingMessage = textMessages[playNextIndex];
      const actualSpeaker = (pendingMessage?.type === 'awaiting_human_panelist') ? pendingMessage.speaker : currentSpeakerId;

      socketRef.current.emit("submit_human_panelist", { text: newTopic, speaker: actualSpeaker });

      //Slice off the waiting for panelist
      setTextMessages((prevMessages) => {
        return prevMessages.slice(0, playNextIndex);
      });

      calculateNextAction();
    } else {
      socketRef.current.emit("submit_human_message", { text: newTopic, speaker: humanName, askParticular: askParticular });

      //Slice off the awaiting_human_question, and invitation if there is one
      const now = textMessages[playingNowIndex].type === 'invitation' ? playingNowIndex - 1 : playingNowIndex;
      const next = textMessages[playingNowIndex].type === 'invitation' ? playNextIndex - 1 : playNextIndex;
      setTextMessages((prevMessages) => {
        return prevMessages.slice(0, now);
      });

      //In case we removed an invitation, go back one step
      setPlayingNowIndex(now);
      setPlayNextIndex(next);

      setIsRaisedHand(false);
      calculateNextAction();
    }
  }

  // When hand is raised
  // We do this as a use effect to get the correct values of human name etc.
  useEffect(() => {
    //Is this triggered exactly only once?
    if (isRaisedHand) {
      socketRef.current.emit("raise_hand", {
        humanName: humanName,
        index: playingNowIndex + 1,
      });

      //Slice off all messages after current one, to avoid playing at certain race conditions
      setTextMessages((prevMessages) => {
        return prevMessages.slice(0, playingNowIndex + 1);
      });
    }
  }, [isRaisedHand]);

  function handleOnRaiseHand() {
    if (humanName === "") {
      setActiveOverlay("name");
    } else {
      setIsRaisedHand(true);
    }
  }

  function handleHumanNameEntered(input: any) {
    if (input.humanName) {
      setHumanName(input.humanName);
      setIsRaisedHand(true);
      setPaused(false);
      removeOverlay();
    }
  }


  // When overlay is closed
  function removeOverlay() {
    setActiveOverlay(null);
    navigate(`/${lang}/meeting/${(currentMeetingId || "new")}`);

    //TODO put this in a better place?
    if (councilState === 'max_reached') {
      setPlayNextIndex(meetingMaxLength - 1);
      setCouncilState('playing');
    } else if (councilState === 'summary') {
      setPlayNextIndex(meetingMaxLength - 2);
      setCouncilState('playing');
    }
  }

  function handleOnContinueMeetingLonger() {
    //This has to be called first because it is also setting the playNext
    // TODO figure out a better solution.
    removeOverlay();

    //Set intended message to current max
    setPlayNextIndex(meetingMaxLength);

    // Increase max converation length to hold more messages
    setMeetingMaxLength((prev) => prev + globalOptions.extraMessageCount);

    //If was paused, unpause
    setPaused(false);

    socketRef.current.emit("continue_conversation");
  }

  // When generate summary button is pressed
  function handleOnGenerateSummary() {
    removeOverlay();
    // Last message will be summary
    setMeetingMaxLength((prev) => prev + 1);
    //Set intended message to current max
    setPlayNextIndex(meetingMaxLength);

    //Use local browser date, in ISO format to avoid ambiguity
    const browserDate = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

    //Wait for the summary
    socketRef.current.emit("wrap_up_meeting", { date: browserDate });

    setCouncilState('loading');
  }

  return (
    <>
      {councilState === 'loading' && <Loading />}
      <>
        {(councilState === 'human_input' || councilState === 'human_panelist') && (
          <HumanInput socketRef={socketRef} isPanelist={(councilState === 'human_panelist')} currentSpeakerName={participants.find(p => p.id === currentSpeakerId)?.name || ""} onSubmitHumanMessage={handleOnSubmitHumanMessage} />
        )}
        <Output
          textMessages={textMessages}
          audioMessages={audioMessages}
          playingNowIndex={playingNowIndex}
          councilState={councilState}
          isMuted={isMuted}
          isPaused={isPaused}
          currentSnippetIndex={currentSnippetIndex}
          setCurrentSnippetIndex={setCurrentSnippetIndex}
          audioContext={audioContext}
          handleOnFinishedPlaying={handleOnFinishedPlaying}
        />
      </>
      {showControls && (
        <ConversationControls
          onSkipBackward={handleOnSkipBackward}
          onSkipForward={handleOnSkipForward}
          onRaiseHand={handleOnRaiseHand}
          isRaisedHand={isRaisedHand}
          isWaitingToInterject={isRaisedHand && councilState !== 'human_input'}
          isMuted={isMuted}
          onMuteUnmute={handleMuteUnmute}
          isPaused={isPaused}
          onPausePlay={() => setPaused(!isPaused)}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          canRaiseHand={canRaiseHand}
          onTopOfOverlay={activeOverlay === "summary" && location.hash === ""}
          humanName={humanName}
        />
      )}
      <Overlay isActive={activeOverlay !== null}>
        {activeOverlay !== null && (
          <CouncilOverlays
            activeOverlay={activeOverlay as any}
            onContinue={handleOnContinueMeetingLonger}
            onWrapItUp={handleOnGenerateSummary}
            proceedWithHumanName={handleHumanNameEntered}
            canExtendMeeting={canExtendMeeting}
            removeOverlay={removeOverlay}
            summary={{ text: summary?.text || "" }}
            meetingId={currentMeetingId}
            participants={participants}
          />
        )}
      </Overlay>
    </>
  );
}

export default Council;
