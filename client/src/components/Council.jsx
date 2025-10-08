import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import io from "socket.io-client";
import FoodItem from "./FoodItem";
import Overlay from "./Overlay";
import CouncilOverlays from "./CouncilOverlays";
import Loading from "./Loading";
import Output from "./Output";
import ConversationControls from "./ConversationControls";
import HumanInput from "./HumanInput";
import { useDocumentVisibility, mapFoodIndex } from "../utils";

const globalOptions = require("../global-options-client");

function Council({
  topic,
  participants,
  setUnrecoverableError,
  setConnectionError,
  connectionError
}) {
  //Overall Council settings for this meeting
  const [humanName, setHumanName] = useState("");

  //Connection variables
  const [currentMeetingId, setCurrentMeetingId] = useState(null); // Use state to manage meetingId
  const [attemptingReconnect, setAttemptingReconnect] = useState(false); // Use state to manage meetingId
  const isDocumentVisible = useDocumentVisibility();// If tab is not active etc

  //Routing
  const navigate = useNavigate();
  const location = useLocation();
  // eslint-disable-next-line
  const [searchParams, setSearchParams] = useSearchParams();

  //Main State variables
  const [activeOverlay, setActiveOverlay] = useState("");
  const [textMessages, setTextMessages] = useState([]); // State to store conversation updates
  const [audioMessages, setAudioMessages] = useState([]); // To store multiple ArrayBuffers
  const [councilState, setCouncilState] = useState("loading"); // Main state
  const [playingNowIndex, setPlayingNowIndex] = useState(-1); //Current message being played
  const [playNextIndex, setPlayNextIndex] = useState(0); //Message to play next, this is what we want to do next
  const [maximumPlayedIndex, setMaximumPlayedIndex] = useState(0); // The maximum message every played
  const [meetingMaxLength, setMeetingMaxLength] = useState(globalOptions.conversationMaxLength);

  //Secondary control variables
  const [isRaisedHand, setIsRaisedHand] = useState(false);
  const [isMuted, setMuteUnmute] = useState(false);
  const [isPaused, setPaused] = useState(false);

  //Automatic calculated state variables
  const [currentSpeakerName, setCurrentSpeakerName] = useState("");
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [canRaiseHand, setCanRaiseHand] = useState(false);
  const [zoomIn, setZoomIn] = useState(false);

  const showControls = (
    councilState === 'playing' ||
    councilState === 'waiting' ||
    (councilState === 'summary' && tryToFindTextAndAudio())
  ) ? true : false;
  const canExtendMeeting = meetingMaxLength < globalOptions.meetingVeryMaxLength;

  //States from lower down
  const [currentSnippetIndex, setCurrentSnippetIndex] = useState(0);
  const [sentencesLength, setSentencesLength] = useState(10);
  const [summary, setSummary] = useState(null);//We store the summary here for easy access

  // Universal references
  const audioContext = useRef(null); // The AudioContext object
  const waitTimer = useRef(null); // The waiting timer
  const socketRef = useRef(null); // Using useRef to persist socket instance

  if (audioContext.current === null) {
    const AudioContext = window.AudioContext || window.webkitAudioContext; //cross browser
    audioContext.current = new AudioContext();
  }

  //Humans and foods
  const foods = participants.filter((part) => part.type !== 'panelist');
  // const humans = participants.filter((part) => part.type === 'panelist');

  //Make sure to empty this timer on component unmount
  //Incase someone restarts the counsil in a break etc.
  useEffect(() => {
    // The empty the betweenTimer on unmount
    return () => {
      clearTimeout(waitTimer.current);
      waitTimer.current = null;
    };
  }, []);

  // Startup and set listeners
  useEffect(() => {
    // Connect to the server
    socketRef.current = io();

    socketRef.current.on('connect_error', err => {
      console.error(err);
      setConnectionError(true);
    });

    socketRef.current.on('connect_failed', err => {
      console.log(err);
    });

    socketRef.current.on('disconnect', err => {
      console.log(err);
    });

    let conversationOptions = {
      topic: topic.prompt,
      characters: participants,
    };

    socketRef.current.io.on("reconnect", () => {
      setAttemptingReconnect(true);
    });

    socketRef.current.emit("start_conversation", conversationOptions);

    socketRef.current.on("meeting_started", (meeting) => {
      setCurrentMeetingId(meeting.meeting_id);
      navigate("/meeting/" + meeting.meeting_id);
    });

    socketRef.current.on("audio_update", (audioMessage) => {
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
    });

    socketRef.current.on("conversation_update", (textMessages) => {
      setTextMessages(() => textMessages);
    });

    socketRef.current.on("conversation_error", (error) => {
      console.error(error);
      setUnrecoverableError(true);
    });

    // Add event listener for tab close
    const handleTabClose = (event) => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };

    window.addEventListener("beforeunload", handleTabClose);

    // Clean up the socket connection when the component unmounts
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      window.removeEventListener("beforeunload", handleTabClose);
    };
  }, []);

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

  // Routing for overlays
  useEffect(() => {
    if (["/about", "/contact", "/share"].includes(location?.pathname)) {
      setActiveOverlay(location?.pathname.substring(1));
    }
  }, [location]);

  // Main state
  // This drives the council meeting forward
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

    switch (councilState) {
      case 'loading':
        // console.log("Updating textMessages: ", textMessages);
        // console.log("Updating audioMessages: ", audioMessages);

        if (tryToFindTextAndAudio()) {
          setPlayingNowIndex(playNextIndex);
          setCouncilState("playing");
        } else if(textMessages[playNextIndex]?.type === 'awaiting_human_panelist') {
          setCouncilState('human_panelist');
        }
        break;
      case 'playing':
        if (playingNowIndex !== playNextIndex) {
          if (tryToFindTextAndAudio()) {//Attempt to play it
            setPlayingNowIndex(playNextIndex);
          } else if(textMessages[playNextIndex]?.type === 'awaiting_human_panelist') {
            setCouncilState('human_panelist');
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
          // We store the summary here just for ease
          // TODO is there a better way to do it?
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

  // Set current speaker name on every change of playing message
  useEffect(() => {
    if (councilState === 'loading') {
      setCurrentSpeakerName("");
    } else if (councilState === 'human_speaking') {
      setCurrentSpeakerName(humanName);
    } else if (councilState === 'human_panelist') {
      setCurrentSpeakerName(textMessages[playNextIndex].speaker);
    } else if (textMessages[playingNowIndex]) {
      setCurrentSpeakerName(textMessages[playingNowIndex].speaker);
    } else {
      setCurrentSpeakerName("");
    }
  }, [councilState, playingNowIndex]);

  // Set when hand can be raised
  useEffect(() => {
    if (
      (councilState === 'playing' || councilState === 'waiting') &&
      playingNowIndex === maximumPlayedIndex &&
      playingNowIndex !== meetingMaxLength - 1
    ) {
      setCanRaiseHand(true);
    } else {
      setCanRaiseHand(false);
    }
  }, [councilState, maximumPlayedIndex, playingNowIndex, meetingMaxLength]);

  // Set when can go forward
  useEffect(() => {
    if ((councilState === 'playing' || councilState === 'waiting') &&
      playingNowIndex < meetingMaxLength
    ) {
      setCanGoForward(true);
    } else {
      setCanGoForward(false);
    }
  }, [councilState, playingNowIndex, meetingMaxLength]);

  // Set when can go backwards
  useEffect(() => {
    if ((councilState === 'playing' ||
      councilState === 'waiting' ||
      councilState === 'summary') &&
      playingNowIndex !== 0
    ) {
      setCanGoBack(true);
    } else {
      setCanGoBack(false);
    }
  }, [councilState, playingNowIndex]);

  // If we reach the end of one message, figure out what to do next
  function calculateNextAction(wait = false) {

    if (councilState === 'human_input' || councilState === 'human_panelist') {// if human input was submitted
      setCouncilState('loading');
    } else if (textMessages[playingNowIndex]?.type === 'invitation') {// if invitation finished
      setCouncilState('human_input');
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

  // Set when zoomed in
  useEffect(() => {
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
      setZoomIn(false);
    } else if (currentSnippetIndex % 4 < 2 && currentSnippetIndex !== sentencesLength - 1) {
      setZoomIn(true);
    } else {
      setZoomIn(false);
    }
  }, [councilState, playingNowIndex, textMessages, currentSnippetIndex]);

  //Some cases when pause should be activated
  useEffect(() => {
    if (activeOverlay !== "" && activeOverlay !== "summary" && !isPaused) {
      setPaused(true);
    } else if (searchParams.get('o') !== null && !isPaused) {
      setPaused(true);
    } else if (connectionError || !isDocumentVisible) {
      setPaused(true);
    }
  }, [isPaused, activeOverlay, location, connectionError, isDocumentVisible]);

  //Pause
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

  /////////////////////
  // Handlers
  /////////////////////

  // Handler getting triggered when an audio message reaches the end
  function handleOnFinishedPlaying() {
    calculateNextAction(true);
  }

  // When skip back is pressed on controls
  function handleOnSkipBackward() {
    if (playingNowIndex - 1 >= 0) {
      setPlayNextIndex(playingNowIndex - 1);
      if (councilState === 'waiting') {
        setCouncilState('playing');
      }
    }
  }

  // When skip forward is pressed on controls
  function handleOnSkipForward() {
    calculateNextAction();
  }

  // When mute is pressed on controls
  function handleMuteUnmute() {
    setMuteUnmute(!isMuted);
  }

  // When a new human message is submitted
  function handleOnSubmitHumanMessage(newTopic, askParticular) {
    if (councilState === 'human_panelist') {
      socketRef.current.emit("submit_human_panelist", { text: newTopic });

      //Slice off the waiting for panelist
      setTextMessages((prevMessages) => {
        return prevMessages.slice(0, playNextIndex);
      });

      calculateNextAction();
    } else {
      socketRef.current.emit("submit_human_message", { text: newTopic, askParticular: askParticular });

      //Slice off the invitation
      setTextMessages((prevMessages) => {
        return prevMessages.slice(0, playingNowIndex);
      });
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

  /////////////////////
  // Some calculations
  /////////////////////

  function currentSpeakerIndex() {
    let currentIndex;
    participants.map((food, index) => {
      if (currentSpeakerName === food.name) {
        currentIndex = mapFoodIndex(participants.length, index);
      }
      return false;//map expects return value, but this is irrelevant in our case
    });
    return currentIndex;
  }

  return (
    <>
      <Background
        zoomIn={zoomIn}
        currentSpeakerIndex={currentSpeakerIndex()}
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
            key={food.name}
            food={food}
            index={mapFoodIndex(foods.length, index)}
            total={foods.length}
            isPaused={isPaused}
            zoomIn={zoomIn}
            currentSpeakerName={currentSpeakerName}
          />
        ))}
      </div>
      {councilState === 'loading' && <Loading />}
      <>
        {(councilState === 'human_input' || councilState === 'human_panelist') && (
          <HumanInput foods={foods} isPanelist={(councilState === 'human_panelist')} currentSpeakerName={currentSpeakerName} onSubmitHumanMessage={handleOnSubmitHumanMessage} />
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
            activeOverlay={activeOverlay}
            onContinue={handleOnContinueMeetingLonger}
            onWrapItUp={handleOnGenerateSummary}
            proceedWithHumanName={handleHumanNameEntered}
            canExtendMeeting={canExtendMeeting}
            removeOverlay={removeOverlay}
            summary={summary}
            meetingId={currentMeetingId}
          />
        )}
      </Overlay>
    </>
  );
}

function Background({ zoomIn, currentSpeakerIndex, totalSpeakers }) {
  function calculateBackdropPosition() {
    return 10 + (80 * currentSpeakerIndex) / totalSpeakers + "%";
  }

  const closeUpBackdrop = {
    backgroundImage: `url(/backgrounds/close-up-backdrop.webp)`,
    backgroundSize: "cover",
    backgroundPosition: calculateBackdropPosition(),
    height: "100%",
    width: "100%",
    position: "absolute",
    opacity: zoomIn ? "1" : "0",
  };

  const closeUpTable = {
    backgroundImage: `url(/backgrounds/close-up-table.webp)`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    height: "100%",
    width: "100%",
    position: "absolute",
    opacity: zoomIn ? "1" : "0",
  };

  const bottomShade = {
    width: "100%",
    height: "40%",
    position: "absolute",
    bottom: "0",
    background: "linear-gradient(0, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0) 100%)",
    zIndex: "1",
  };

  const topShade = {
    width: "100%",
    height: "10%",
    position: "absolute",
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

export default Council;
