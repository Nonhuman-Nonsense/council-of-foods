import React, { useState, useEffect, useRef } from "react";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import ConversationControlIcon from "./ConversationControlIcon";
import TextareaAutosize from 'react-textarea-autosize';

function HumanInput({ onSubmitHumanMessage }) {
  const [isRecording, setIsRecording] = useState(false);
  const [canContinue, setCanContinue] = useState(false);
  const [previousTranscript, setPreviousTranscript] = useState("");
  const inputArea = useRef(null);

  // Accessing the speech recognition features from the custom hook
  const {
    transcript,
    listening,
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
        if(browserSupportsContinuousListening){
          SpeechRecognition.startListening({ continuous: true });
        }else{
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

  function inputFocused(e){
    setIsRecording(false);
  }

  function inputChanged(e){
    if(inputArea.current.value.length > 0){
      setCanContinue(true);
    }else{
      setCanContinue(false);
    }
  }

  const wrapperStyle = {
    position: "absolute",
    bottom: "0",
  };

  const micStyle = {
    position: "absolute",
    bottom: "-2vh",
    left: "50%",
    height: "45vh",
    zIndex: "0",
    animation: "4s micAppearing",
    animationFillMode: "both",
  };

  const divStyle = {
    width: "56px",
    height: "56px",
    zIndex: "3"
  };

  const textStyle = {
    backgroundColor: "transparent",
    width: "70vw",
    color: "white",
    textAlign: "center",
    border: "0",
    fontFamily: "Arial, sans-serif",
    fontSize: "25px",
    resize: "none",
    padding: "0",
  };

  return (
    <div style={wrapperStyle}>
      <img src="/images/mic.png" style={micStyle} />
      <div style={{zIndex: "4", position: "relative", pointerEvents: "auto"}}>
        <TextareaAutosize
          ref={inputArea}
          style={textStyle}
          onChange={inputChanged}
          onFocus={inputFocused}
          className="unfocused"
          minRows="1"
          maxRows="6"
          placeholder="Type your question or start recording..."
        />
      </div>
      <div style={{ display: "flex", flexDirection: "row", pointerEvents: "auto", justifyContent: "center" }}>
        <div style={divStyle}/>
        <div style={divStyle}>
          <ConversationControlIcon
            icon={(isRecording ? "record_voice_on" : "record_voice_off" )}
            onClick={handleStartStopRecording}
            tooltip={"Mute"}
          />
        </div>
        <div style={divStyle}>
          {canContinue &&
            <ConversationControlIcon
              icon={"send_message"}
              tooltip={"Mute"}
              onClick={() => {
                setIsRecording(false);
                onSubmitHumanMessage(inputArea.current.value);
              }}
            />
          }
        </div>
      </div>
    </div>
  );
}

export default HumanInput;
