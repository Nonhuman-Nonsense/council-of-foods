import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router";
import io from "socket.io-client";
import FoodItem from "./FoodItem";
import Overlay from "./Overlay";
import CouncilOverlays from "./CouncilOverlays";
import Loading from "./Loading";
import Output from "./Output";
import ConversationControls from "./ConversationControls";
import HumanInput from "./HumanInput";
import { useDocumentVisibility, mapFoodIndex } from "../utils";

// @ts-ignore
import globalOptions from "../global-options-client";
import { useCouncilSocket } from "../hooks/useCouncilSocket";

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
// @ts-ignore
function Council({
  lang,
  topic,
  participants,
  setUnrecoverableError,
  setConnectionError,
  connectionError
}: any) {
  //Overall Council settings for this meeting
  const [humanName, setHumanName] = useState("");

  //Humans and foods
  const foods = participants.filter((part: any) => part.type !== 'panelist');


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

  const [activeOverlay, setActiveOverlay] = useState("");
  const [textMessages, setTextMessages] = useState<any[]>([]); // State to store conversation updates
  const [audioMessages, setAudioMessages] = useState<any[]>([]); // To store multiple ArrayBuffers

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

  const audioContext = useRef(null); // The AudioContext object
  const waitTimer = useRef(null); // The waiting timer

  if (audioContext.current === null) {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext; //cross browser
    audioContext.current = new AudioContext();
  }

  /* -------------------------------------------------------------------------- */
  /*                             Secondary Controls                             */
  /* -------------------------------------------------------------------------- */

  const [isRaisedHand, setIsRaisedHand] = useState(false);
  const [isMuted, setMuteUnmute] = useState(false);
  const [isPaused, setPaused] = useState(false);

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
      navigate("/meeting/" + meeting.meeting_id);
    },
    onAudioUpdate: (audioMessage) => {
      (async () => {
        if (audioMessage.audio) {
          const buffer = await audioContext.current.decodeAudioData(
            audioMessage.audio
          );
          audioMessage.audio = buffer;
        }
        setAudioMessages((prevAudioMessages) => [
          ...prevAudioMessages,
          audioMessage,
        ]);
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
  /*                             State Initialization                           */
  /* -------------------------------------------------------------------------- */

  // States passed down to children or used for specific features
  const [currentSnippetIndex, setCurrentSnippetIndex] = useState(0);
  const [sentencesLength, setSentencesLength] = useState(10);
  const [summary, setSummary] = useState(null); // We store the summary here for easy access

  /* -------------------------------------------------------------------------- */
  /*                               Derived State                                */
  /* -------------------------------------------------------------------------- */
  const currentSpeakerId = useMemo(() => {
    if (councilState === 'loading') return "";
    if (councilState === 'human_input') return humanName;
    if (councilState === 'human_panelist' && textMessages[playNextIndex]) return textMessages[playNextIndex].speaker;
    if (textMessages[playingNowIndex]) return textMessages[playingNowIndex].speaker;
    return "";
  }, [councilState, playingNowIndex, textMessages, playNextIndex, humanName]);

  const canRaiseHand = (
    (councilState === 'playing' || councilState === 'waiting') &&
    playingNowIndex === maximumPlayedIndex &&
    playingNowIndex !== meetingMaxLength - 1
  );

  const canGoForward = (
    (councilState === 'playing' || councilState === 'waiting') &&
    playingNowIndex < meetingMaxLength
  );

  const canGoBack = (
    (councilState === 'playing' ||
      councilState === 'waiting' ||
      councilState === 'summary') &&
    playingNowIndex !== 0
  );

  const zoomIn = useMemo(() => {
    if (
      councilState === 'loading' ||
      councilState === 'waiting' ||
      councilState === 'max_reached' ||
      councilState === 'summary' ||
      councilState === 'human_input' ||
      councilState === 'human_panelist' ||
      playingNowIndex <= 0 ||
      textMessages[playingNowIndex]?.type === "human" ||
      textMessages[playingNowIndex]?.type === "panelist"
    ) {
      return false;
    } else if (currentSnippetIndex % 4 < 2 && currentSnippetIndex !== sentencesLength - 1) {
      return true;
    } else {
      return false;
    }
  }, [councilState, playingNowIndex, textMessages, currentSnippetIndex, sentencesLength]);

  const showControls = (
    councilState === 'playing' ||
    councilState === 'waiting' ||
    (councilState === 'summary' && tryToFindTextAndAudio())
  ) ? true : false;
  const canExtendMeeting = meetingMaxLength < globalOptions.meetingVeryMaxLength;

  /* -------------------------------------------------------------------------- */
  /*                                 Pause Logic                                */
  /* -------------------------------------------------------------------------- */

  //Some cases when pause should be activated
  useEffect(() => {
    if (activeOverlay !== "" && activeOverlay !== "summary" && !isPaused) {
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
      if (audioContext.current.state !== "suspended") {
        audioContext.current.suspend();
      }
    } else if (audioContext.current.state === "suspended") {
      audioContext.current.resume();
    }
  }, [isPaused, councilState]);

  //Handle special case if pause is pressed while waiting
  useEffect(() => {
    if (councilState === 'waiting') {
      if (isPaused) {
        //Stop the waiting timer
        clearTimeout(waitTimer.current);
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
    if (councilState !== 'waiting') {
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
        if (activeOverlay === "") {
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

  /**
   * Determines the next step after a message finishes playing or an action is taken.
   * Updates `playNextIndex` to the next logical message and transitions state to 'waiting' or 'playing'.
   * Handles end-of-meeting limits (`max_reached`).
   * 
   * @param {boolean} wait - If true, adds a brief delay (state: 'waiting') before playing the next message.
   */
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
  function handleOnSubmitHumanMessage(newTopic, askParticular) {
    if (councilState === 'human_panelist') {
      socketRef.current.emit("submit_human_panelist", { text: newTopic, speaker: currentSpeakerId });

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

      //TODO What if a another conversation update is received right after this one, but then is deleted on the server?
      //Could lead to that message being played once but then disappearing on the client side?
    }
  }, [isRaisedHand]);

  function handleOnRaiseHand() {
    if (humanName === "") {
      setActiveOverlay("name");
    } else {
      setIsRaisedHand(true);
    }
  }

  function handleHumanNameEntered(input) {
    if (input.humanName) {
      setHumanName(input.humanName);
      setIsRaisedHand(true);
      setPaused(false);
      removeOverlay();
    }
  }


  // When overlay is closed
  function removeOverlay() {
    setActiveOverlay("");
    navigate("/meeting/" + (currentMeetingId || "new"));

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

  /* -------------------------------------------------------------------------- */
  /*                               Visual Helpers                               */
  /* -------------------------------------------------------------------------- */

  //Only used for calculations on screen, so is current speaker of the foods.
  const currentSpeakerIdx = useMemo(() => {
    let currentIndex;
    foods.forEach((food, index) => {
      if (currentSpeakerId === food.id) {
        currentIndex = mapFoodIndex(foods.length, index);
      }
    });
    return currentIndex;
  }, [foods, currentSpeakerId]);

  return (
    <>
      <MemoizedBackground
        zoomIn={zoomIn}
        currentSpeakerIndex={currentSpeakerIdx}
        totalSpeakers={foods.length - 1}
      />
      <div style={{
        position: "absolute",
        top: "62%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: participants.length > 6 ? "79%" : "70%",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
      }}>
        {foods.map((food, index) => (
          <FoodItem
            key={food.id}
            food={food}
            index={mapFoodIndex(foods.length, index)}
            total={foods.length}
            isPaused={isPaused}
            zoomIn={zoomIn}
            currentSpeakerId={currentSpeakerId}
          />
        ))}
      </div>
      {councilState === 'loading' && <Loading />}
      <>
        {(councilState === 'human_input' || councilState === 'human_panelist') && (
          <HumanInput socketRef={socketRef} foods={foods} isPanelist={(councilState === 'human_panelist')} currentSpeakerName={participants.find(p => p.id === currentSpeakerId)?.name} onSubmitHumanMessage={handleOnSubmitHumanMessage} />
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
          setSentencesLength={setSentencesLength}
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
          onTopOfOverlay={activeOverlay === "summary"}
          humanName={humanName}
        />
      )}
      <Overlay isActive={activeOverlay !== ""}>
        {activeOverlay !== "" && (
          <CouncilOverlays
            activeOverlay={activeOverlay as any}
            onContinue={handleOnContinueMeetingLonger}
            onWrapItUp={handleOnGenerateSummary}
            proceedWithHumanName={handleHumanNameEntered}
            canExtendMeeting={canExtendMeeting}
            removeOverlay={removeOverlay}
            summary={summary}
            meetingId={currentMeetingId}
            participants={participants}
          />
        )}
      </Overlay>
    </>
  );
}

export function Background({ zoomIn, currentSpeakerIndex, totalSpeakers }) {
  function calculateBackdropPosition() {
    return 10 + (80 * currentSpeakerIndex) / totalSpeakers + "%";
  }

  const closeUpBackdrop = {
    backgroundImage: `url(/backgrounds/close-up-backdrop.webp)`,
    backgroundSize: "cover",
    backgroundPosition: calculateBackdropPosition(),
    height: "100%",
    width: "100%",
    position: "absolute" as "absolute",
    opacity: zoomIn ? "1" : "0",
  };

  const closeUpTable = {
    backgroundImage: `url(/backgrounds/close-up-table.webp)`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    height: "100%",
    width: "100%",
    position: "absolute" as "absolute",
    opacity: zoomIn ? "1" : "0",
  };

  const bottomShade = {
    width: "100%",
    height: "40%",
    position: "absolute" as "absolute",
    bottom: "0",
    background: "linear-gradient(0, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0) 100%)",
    zIndex: "1",
  };

  const topShade = {
    width: "100%",
    height: "10%",
    position: "absolute" as "absolute",
    top: "0",
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0) 100%)",
    zIndex: "1",
  };

  return (
    <>
      <div style={closeUpBackdrop} />
      <div style={closeUpTable} />
      <div style={bottomShade} />
      <div style={topShade} />
    </>
  );
}

const MemoizedBackground = React.memo(Background);

export default Council;
