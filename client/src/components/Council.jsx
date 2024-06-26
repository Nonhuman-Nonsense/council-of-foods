import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import io from "socket.io-client";
import FoodItem from "./FoodItem";
import Overlay from "./Overlay";
import CouncilOverlays from "./CouncilOverlays";
import Navbar from "./Navbar";
import Loading from "./Loading";
import Output from "./Output";
import ConversationControls from "./ConversationControls";
import HumanInput from "./HumanInput";

function Council({ options }) {
  const { foods, humanName, topic } = options;
  const [activeOverlay, setActiveOverlay] = useState("");
  const [textMessages, setTextMessages] = useState([]); // State to store conversation updates
  const [audioMessages, setAudioMessages] = useState([]); // To store multiple ArrayBuffers
  const [isRaisedHand, setIsRaisedHand] = useState(false);
  const [isMuted, setMuteUnmute] = useState(false);
  const [isPaused, setPausePlay] = useState(false);
  const [skipForward, setSkipForward] = useState(false);
  const [skipBackward, setSkipBackward] = useState(false);
  const [currentSpeakerName, setCurrentSpeakerName] = useState("");
  const [invitationIndex, setInvitationIndex] = useState(0);
  const [isWaitingToInterject, setIsWaitingToInterject] = useState(false);
  const [isInterjecting, setIsInterjecting] = useState(false);
  const [bumpIndex1, setBumpIndex1] = useState(false);
  const audioContext = useRef(null); // The AudioContext object
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [canRaiseHand, setCanRaiseHand] = useState(false);
  const [isReadyToStart, setIsReadyToStart] = useState(false);
  const [zoomIn, setZoomIn] = useState(false);
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [conversationMaxLength, setConversationMaxLength] = useState(10);
  const [invitation, setInvitation] = useState(null);
  const [playInvitation, setPlayinvitation] = useState(false);
  const [summary, setSummary] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [continuations, setContinuations] = useState(0);
  const [currentMeetingId, setCurrentMeetingId] = useState(null); // Use state to manage meetingId
  const [attemptingReconnect, setAttemptingReconnect] = useState(false); // Use state to manage meetingId

  if (audioContext.current === null) {
    const AudioContext = window.AudioContext || window.webkitAudioContext; //cross browser
    audioContext.current = new AudioContext();
  }

  const socketRef = useRef(null); // Using useRef to persist socket instance

  const handWasRaised = useRef(false);

  const foodsContainerStyle = {
    position: "absolute",
    top: "calc(50% + 12vh)",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: foods.length > 6 ? "79%" : "70%",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
  };

  useEffect(() => {
    // Connect to the server
    socketRef.current = io();

    let conversationOptions = {
      humanName: humanName,
      topic: topic.prompt,
      characters: foods,
    };

    socketRef.current.io.on("reconnect", () => {
      setAttemptingReconnect(true);
    });

    socketRef.current.emit("start_conversation", conversationOptions);

    socketRef.current.on("invitation_to_speak", (invitation) => {
      setInvitation(invitation);
    });

    socketRef.current.on("meeting_started", (meeting) => {
      setCurrentMeetingId(meeting.meeting_id);
      navigate("/meeting/" + meeting.meeting_id);
    });

    socketRef.current.on("meeting_summary", (summary) => {
      setSummary(summary);
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

  useEffect(() => {
    if(attemptingReconnect && currentMeetingId){
      socketRef.current.emit("attempt_reconnection", {
        meetingId: currentMeetingId,
        handRaised: isRaisedHand,
        conversationMaxLength: conversationMaxLength
      });
      setAttemptingReconnect(false);
    }
  },[attemptingReconnect,currentMeetingId]);

  useEffect(() => {
    if (["/about", "/contact", "/share"].includes(location?.pathname)) {
      setActiveOverlay(location?.pathname.substring(1));
    }
  }, [location]);

  useEffect(() => {
    if (isPaused) {
      audioContext.current.suspend();
    } else if (audioContext.current.state === "suspended") {
      audioContext.current.resume();
    }
  }, [isPaused]);

  useEffect(() => {
    if (activeOverlay !== "" && activeOverlay !== "summary" && !isPaused) {
      setPausePlay(true);
    }
  }, [activeOverlay]);

  useEffect(() => {
    if (
      summary &&
      textMessages[currentMessageIndex]?.purpose === "summary" &&
      activeOverlay === ""
    ) {
      displayOverlay("summary");
    } else if (
      activeOverlay === "summary" &&
      textMessages[currentMessageIndex]?.purpose !== "summary"
    ) {
      removeOverlay();
    }
  }, [summary, textMessages, currentMessageIndex, activeOverlay]);

  function handleOnSkipBackward() {
    setSkipBackward(!skipBackward);
  }

  function handleOnSkipForward() {
    setSkipForward(!skipForward);
  }

  function handleMuteUnmute() {
    setMuteUnmute(!isMuted);
  }

  function handlePausePlay() {
    setPausePlay(!isPaused);
  }

  function handleSetCurrentSpeakerName(value) {
    setCurrentSpeakerName(value);
  }

  useEffect(() => {
    if (isRaisedHand && !handWasRaised.current) {
      handleOnIsWaitingToInterject({
        isWaiting: true,
        isReadyToInterject: false,
      });

      if (!handWasRaised.current) {
        handWasRaised.current = true;
        setInvitation(null);
        socketRef.current.emit("raise_hand", {
          index: currentMessageIndex + 1,
        });
        setInvitationIndex(currentMessageIndex + 1);
      }
    } else if (handWasRaised.current) {
      //Hand lowered
      handleOnIsWaitingToInterject({
        isWaiting: false,
        isReadyToInterject: false,
      });

      socketRef.current.emit("lower_hand");
    }
  }, [isRaisedHand]);

  useEffect(() => {
    if (playInvitation) {
      //Cut all messages on the client after this, to avoid rendering the wrong thing, and wait for a conversation update
      setTextMessages((prevMessages) => {
        const beforeInvitation = prevMessages.slice(0, invitationIndex);
        beforeInvitation.push(invitation);
        return beforeInvitation;
      });

      //Play invitation
      setCurrentMessageIndex(invitationIndex);
    }
  }, [playInvitation]);

  function handleOnSubmitHumanMessage(newTopic) {
    socketRef.current.emit("submit_human_message", { text: newTopic });

    //Wait for message after invitation
    setCurrentMessageIndex(invitationIndex + 1);
    //Show loading
    setIsReadyToStart(false);
    //Reset hand raised vars
    setIsInterjecting(false);
    setIsRaisedHand(false);
    setInvitation(null);
  }

  function handleOnRaiseHandOrNevermind() {
    setIsRaisedHand((prev) => !prev);
  }

  // Function to handle overlay content based on navbar clicks
  const displayOverlay = (section) => {
    setActiveOverlay(section); // Update state to control overlay content
  };

  function removeOverlay() {
    setActiveOverlay("");
    navigate("/meeting/" + (currentMeetingId || "new"));
  }

  function handleOnIsWaitingToInterject({ isWaiting, isReadyToInterject }) {
    setIsWaitingToInterject(isWaiting);

    if (isReadyToInterject) {
      handleSetCurrentSpeakerName(humanName);
      setIsInterjecting(true);
    }

    if (!isWaiting) {
      handWasRaised.current = false;
    }
  }

  //Put water in the middle always
  function mapFoodIndex(total, index) {
    return (Math.ceil(total / 2) + index - 1) % total;
  }

  function handleOnCompletedConversation() {
    // Zoom out
    setZoomIn(false);
    displayOverlay("completed");
  }

  function handleOnContinue() {
    setBumpIndex1(!bumpIndex1);
    setContinuations(continuations + 1);

    setIsReadyToStart(false);
    // Increase max converation length to hold 5 more messages
    setConversationMaxLength((prev) => prev + 5);

    removeOverlay();

    socketRef.current.emit("continue_conversation");
  }

  function handleOnResumeConversation() {
    // Play messages
    setPausePlay(false);
  }

  function handleOnWrapItUp() {
    setBumpIndex1(!bumpIndex1);

    setIsReadyToStart(false);

    removeOverlay();

    socketRef.current.emit("wrap_up_meeting");
  }

  function currentSpeakerIndex() {
    let currentIndex;
    foods.map((food, index) => {
      if (currentSpeakerName === food.name) {
        currentIndex = mapFoodIndex(foods.length, index);
      }
    });
    return currentIndex;
  }

  function handleOnNavigate(adress) {
    if (adress === "") {
      displayOverlay("reset");
    } else if (adress === "settings") {
      displayOverlay("settings");
      navigate("/meeting/" + (currentMeetingId || "new"));
    } else {
      navigate(adress);
    }
  }

  return (
    <>
      <Background
        zoomIn={zoomIn}
        currentSpeakerIndex={currentSpeakerIndex()}
        totalSpeakers={foods.length - 1}
      />
      <Navbar
        topic={options.topic.title}
        activeOverlay={activeOverlay}
        onDisplayOverlay={displayOverlay}
        onRemoveOverlay={removeOverlay}
        onDisplayResetWarning={() => displayOverlay("reset")}
        onNavigate={handleOnNavigate}
      />
      <div style={foodsContainerStyle}>
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
      {!isReadyToStart && <Loading />}
      <>
        {isInterjecting && (
          <HumanInput onSubmitHumanMessage={handleOnSubmitHumanMessage} />
        )}
        <Output
          textMessages={textMessages}
          audioMessages={audioMessages}
          isMuted={isMuted}
          isPaused={isPaused}
          skipForward={skipForward}
          skipBackward={skipBackward}
          handleSetCurrentSpeakerName={handleSetCurrentSpeakerName}
          onIsWaitingToInterject={handleOnIsWaitingToInterject}
          isWaitingToInterject={isWaitingToInterject}
          bumpIndex1={bumpIndex1}
          audioContext={audioContext}
          setCanGoForward={setCanGoForward}
          setCanGoBack={setCanGoBack}
          setIsReadyToStart={setIsReadyToStart}
          setCanRaiseHand={setCanRaiseHand}
          isReadyToStart={isReadyToStart}
          setZoomIn={setZoomIn}
          isInterjecting={isInterjecting}
          onCompletedConversation={handleOnCompletedConversation}
          currentMessageIndex={currentMessageIndex}
          setCurrentMessageIndex={setCurrentMessageIndex}
          conversationMaxLength={conversationMaxLength}
          invitation={invitation}
          playInvitation={playInvitation}
          setPlayinvitation={setPlayinvitation}
          onResumeConversation={handleOnResumeConversation}
          summary={summary}
        />
      </>
      {isReadyToStart && !isInterjecting && (
        <ConversationControls
          onSkipBackward={handleOnSkipBackward}
          onSkipForward={handleOnSkipForward}
          onRaiseHandOrNevermind={handleOnRaiseHandOrNevermind}
          isRaisedHand={isRaisedHand}
          isWaitingToInterject={isWaitingToInterject}
          isMuted={isMuted}
          onMuteUnmute={handleMuteUnmute}
          isPaused={isPaused}
          onPausePlay={handlePausePlay}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          canRaiseHand={activeOverlay !== "summary" && canRaiseHand}
          onTopOfOverlay={activeOverlay === "summary"}
        />
      )}
      <Overlay isActive={activeOverlay !== ""}>
        {activeOverlay !== "" && (
          <CouncilOverlays
            activeOverlay={activeOverlay}
            options={{
              ...options,
              onContinue: handleOnContinue,
              onWrapItUp: handleOnWrapItUp,
              continuations: continuations,
            }}
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
    height: "100vh",
    width: "100vw",
    position: "absolute",
    opacity: zoomIn ? "1" : "0",
  };

  const closeUpTable = {
    backgroundImage: `url(/backgrounds/close-up-table.webp)`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    height: "100vh",
    width: "100vw",
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
