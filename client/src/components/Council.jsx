import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";
import FoodItem from "./FoodItem";
import Overlay from "./Overlay";
import CouncilOverlays from "./CouncilOverlays";
import Navbar from "./Navbar";
import Loading from "./Loading";
import Output from "./Output";
import ConversationControls from "./ConversationControls";
import HumanInput from "./HumanInput";
import { useCouncil } from "./CouncilContext";
import { useSocket } from "./SocketContext";

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
  const { councilState, setCouncilState } = useCouncil();

  if (audioContext.current === null) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContext.current = new AudioContext();
  }

  const socket = useSocket();
  const { addTextMessage, addAudioMessage } = useCouncil();

  const handWasRaised = useRef(false);

  const foodsContainerStyle = {
    position: "absolute",
    top: "calc(50% + 12vh)",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "70%",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
  };

  useEffect(() => {
    console.log("SOCKET IN COUNCIL: ", socket);

    if (!councilState.initialized && socket) {
      setCouncilState((prevState) => ({
        ...prevState,
        initialized: true,
        humanName,
        topic,
        foods,
      }));

      socket.emit("start_conversation", {
        humanName: humanName,
        topic: topic.prompt,
        characters: foods,
      });
    } else {
      console.log("TEXT IN COUNCIL STATE: ", councilState.textMessages);
      console.log("AUDIO IN COUNCIL STATE: ", councilState.audioMessages);

      setTextMessages(councilState.textMessages);
      setAudioMessages(councilState.audioMessages);
    }

    // Setup socket event listeners
    socket.on("conversation_update", (messages) => {
      setTextMessages(messages);
      setCouncilState((prevState) => ({
        ...prevState,
        textMessages: messages,
      }));
    });

    socket.on("invitation_to_speak", (invite) => {
      setInvitation(invite);
    });

    socket.on("meeting_summary", (summary) => {
      setSummary(summary);
    });

    socket.on("audio_update", async (audioMessage) => {
      if (audioMessage.audio) {
        try {
          const buffer = await audioContext.current.decodeAudioData(
            audioMessage.audio
          );
          if (buffer) {
            audioMessage.audio = buffer;
            setAudioMessages((prevAudioMessages) => [
              ...prevAudioMessages,
              audioMessage,
            ]);
            setCouncilState((prevState) => ({
              ...prevState,
              audioMessages: [...prevState.audioMessages, audioMessage],
            }));
          } else {
            console.error("Decoded audio buffer is null");
          }
        } catch (error) {
          console.error("Error decoding audio data:", error);
        }
      }
    });

    // Return cleanup function to remove event listeners
    return () => {
      socket.off("conversation_update");
      socket.off("invitation_to_speak");
      socket.off("meeting_summary");
      socket.off("audio_update");
    };
  }, []);

  // useEffect(() => {
  //   if (humanName && topic && foods) {
  //     setCouncilState((prevState) => ({
  //       ...prevState,
  //       humanName: humanName,
  //       topic: topic,
  //       foods: foods,
  //     }));
  //   }

  //   if (!councilState.initialized) {
  //     setCouncilState((prevState) => ({
  //       ...prevState,
  //       initialized: true,
  //     }));

  //     // Start conversation et.c.

  //     const conversationOptions = {
  //       humanName: humanName,
  //       topic: topic.prompt,
  //       characters: foods,
  //     };

  //     socket.emit("start_conversation", conversationOptions);
  //   } else {
  //     // Read councilState
  //     // Set text and audio messages
  //     // Get more text and audio

  //     setTextMessages(councilState.textMessages);
  //     setAudioMessages(councilState.audioMessages);
  //     setCurrentMessageIndex(councilState.currentMessageIndex);

  //     // Resume conversation instead
  //     console.log("Resuming conversation");
  //     // TODO: Get more messages!?
  //     // TODO: Or only able to go to /about if all messages have been recieved?
  //   }

  //   socket.on("conversation_update", (messages) => {
  //     setTextMessages(messages);
  //     setCouncilState((prevState) => ({
  //       ...prevState,
  //       textMessages: messages,
  //     }));
  //   });

  //   socket.on("invitation_to_speak", (invite) => {
  //     setInvitation(invite);
  //   });

  //   socket.on("meeting_summary", (sum) => {
  //     console.log("Summary received...");
  //     setSummary(sum);
  //   });

  //   socket.on("audio_update", async (audioMessage) => {
  //     if (audioMessage.audio) {
  //       const buffer = await audioContext.current.decodeAudioData(
  //         audioMessage.audio
  //       );
  //       audioMessage.audio = buffer;

  //       setAudioMessages((prevAudioMessages) => [
  //         ...prevAudioMessages,
  //         audioMessage,
  //       ]);

  //       setCouncilState((prevState) => {
  //         return {
  //           ...prevState,
  //           audioMessages: [...prevState.audioMessages, audioMessage],
  //         };
  //       });
  //     }
  //   });

  //   return () => {
  //     socket.disconnect();
  //   };
  // }, []);

  useEffect(() => {
    if (isPaused) {
      audioContext.current.suspend();
    } else if (audioContext.current.state === "suspended") {
      audioContext.current.resume();
    }
  }, [isPaused]);

  useEffect(() => {
    if (activeOverlay !== "" && !isPaused) {
      setPausePlay(true);
    }
  }, [activeOverlay]);

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
      setIsWaitingToInterject(true);
      setIsInterjecting(false);

      handWasRaised.current = true;
      setInvitation(null);
      socket.emit("raise_hand", {
        index: currentMessageIndex + 1,
      });
      setInvitationIndex(currentMessageIndex + 1);
    } else if (!isRaisedHand && handWasRaised.current) {
      setIsWaitingToInterject(false);
      setIsInterjecting(false);

      socket.emit("lower_hand");
      handWasRaised.current = false;
    }
  }, [isRaisedHand]);

  useEffect(() => {
    if (playInvitation) {
      setTextMessages((prevMessages) => {
        const beforeInvitation = prevMessages.slice(0, invitationIndex);
        beforeInvitation.push(invitation);
        return beforeInvitation;
      });

      setCurrentMessageIndex(invitationIndex);
    }
  }, [playInvitation]);

  function handleOnSubmitHumanMessage(newTopic) {
    socket.emit("submit_human_message", { text: newTopic });
    setCurrentMessageIndex(invitationIndex + 1);
    setIsReadyToStart(false);
    setIsInterjecting(false);
    setIsRaisedHand(false);
    setInvitation(null);
  }

  function handleOnRaiseHandOrNevermind() {
    setIsRaisedHand((prev) => !prev);
  }

  function displayResetWarning() {
    setActiveOverlay("reset");
  }

  const displayOverlay = (section) => {
    setActiveOverlay(section);
  };

  const removeOverlay = () => {
    setActiveOverlay("");
  };

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

  function mapFoodIndex(total, index) {
    return (Math.ceil(total / 2) + index - 1) % total;
  }

  function handleOnCompletedConversation() {
    setZoomIn(false);
    displayOverlay("completed");
  }

  function handleOnContinue() {
    setBumpIndex1((prev) => !prev);
    setIsReadyToStart(false);
    setConversationMaxLength((prev) => prev + 10);
    removeOverlay();
    socket.emit("continue_conversation");
  }

  function handleOnResumeConversation() {
    setPausePlay(false);
  }

  function handleOnWrapItUp() {
    setBumpIndex1((prev) => !prev);
    setIsReadyToStart(false);
    removeOverlay();
    socket.emit("submit_injection", {
      text: "Water, generate a complete summary of the meeting.",
      index: textMessages.length,
    });
  }

  function handleOnCompletedSummary() {
    console.log("Resetting");
    options.onReset();
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
        onDisplayResetWarning={displayResetWarning}
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
        onCompletedSummary={handleOnCompletedSummary}
        currentMessageIndex={currentMessageIndex}
        setCurrentMessageIndex={setCurrentMessageIndex}
        conversationMaxLength={conversationMaxLength}
        invitation={invitation}
        playInvitation={playInvitation}
        setPlayinvitation={setPlayinvitation}
        onResumeConversation={handleOnResumeConversation}
        summary={summary}
      />
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
          canRaiseHand={canRaiseHand}
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
            }}
            removeOverlay={removeOverlay}
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
