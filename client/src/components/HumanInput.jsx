import React, { useState, useEffect, useRef } from "react";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import ConversationControlIcon from "./ConversationControlIcon";
import TextareaAutosize from 'react-textarea-autosize';
import { useMobile, dvh } from "../utils";

function HumanInput({ onSubmitHumanMessage }) {
  const [isRecording, setIsRecording] = useState(false);
  const [canContinue, setCanContinue] = useState(false);
  const [previousTranscript, setPreviousTranscript] = useState("");
  const inputArea = useRef(null);
  const isMobile = useMobile();

  const maxInputLength = 350;

  // Accessing the speech recognition features from the custom hook
  const {
    transcript,
    // listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    browserSupportsContinuousListening,
  } = useSpeechRecognition();

  // Effect to manage speech recognition state
  useEffect(() => {
    if (browserSupportsSpeechRecognition) {
      if (isRecording) {
        setPreviousTranscript(inputArea.current.value);
        resetTranscript();
        if (browserSupportsContinuousListening) {
          SpeechRecognition.startListening({ continuous: true });
        } else {
          SpeechRecognition.startListening();
        }
      } else {
        SpeechRecognition.stopListening();
      }
    }
  }, [isRecording]);

  function handleStartStopRecording() {
    setIsRecording(!isRecording); // Toggle the recording state
  }

  useEffect(() => {
    inputArea.current.value = (previousTranscript ? previousTranscript + " " + transcript : transcript);
    inputChanged();
  }, [transcript]);

  function inputFocused(e) {
    setIsRecording(false);
  }

  function inputChanged(e) {
    if (inputArea.current.value.length > 0 && inputArea.current.value.trim().length !== 0) {
      setCanContinue(true);
    } else {
      setCanContinue(false);
    }
  }

  function checkEnter(e) {
    if (canContinue && !e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      submitAndContinue();
    }
  }

  function submitAndContinue() {
    setIsRecording(false);
    onSubmitHumanMessage(inputArea.current.value.substring(0, maxInputLength));
  }

  const wrapperStyle = {
    position: "absolute",
    bottom: "0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };

  const micStyle = {
    position: "absolute",
    bottom: "0" + dvh,
    height: "65" + dvh,
    minHeight: "195px",
    zIndex: "0",
    animation: "4s micAppearing",
    animationFillMode: "both",
  };

  const divStyle = {
    width: isMobile ? "45px" : "56px",
    height: isMobile ? "45px" : "56px",
    zIndex: "3"
  };

  const textStyle = {
    backgroundColor: "rgba(0,0,0,0.5)",
    width: "70vw",
    color: "white",
    textAlign: "center",
    border: "0",
    fontFamily: "Arial, sans-serif",
    fontSize: isMobile ? "18px" : "25px",
    margin: isMobile && "0",
    marginBottom: isMobile && "-8px",
    lineHeight: "1.1em",
    resize: "none",
    padding: "0",
  };

  return (
    <div style={wrapperStyle}>
      <img alt="Say something!" src="/mic.avif" style={micStyle} />
      <div style={{ zIndex: "4", position: "relative", pointerEvents: "auto" }}>
        <TextareaAutosize
          ref={inputArea}
          style={textStyle}
          onChange={inputChanged}
          onKeyDown={checkEnter}
          onFocus={inputFocused}
          className="unfocused"
          minRows="1"
          maxRows="6"
          maxLength={maxInputLength}
          placeholder={browserSupportsSpeechRecognition ? "Type your question or start recording..." : "Type your question..."}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "row", pointerEvents: "auto", justifyContent: "center" }}>
        <div style={divStyle} />
        {browserSupportsSpeechRecognition &&
          <div style={divStyle}>
            <ConversationControlIcon
              icon={(isRecording ? "record_voice_on" : "record_voice_off")}
              onClick={handleStartStopRecording}
              tooltip={"Mute"}
            />
          </div>
        }
        <div style={divStyle}>
          {canContinue &&
            <ConversationControlIcon
              icon={"send_message"}
              tooltip={"Mute"}
              onClick={submitAndContinue}
            />
          }
        </div>
        {!browserSupportsSpeechRecognition && <div style={divStyle} />}
      </div>
    </div>
  );
}

export default HumanInput;
