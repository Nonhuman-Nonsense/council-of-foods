import { faUserTimes } from "@fortawesome/free-solid-svg-icons";
import React, { useState, useEffect } from "react";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";

function HumanInput({ onSubmitNewTopic }) {
  const [isRecording, setIsRecording] = useState(false);

  // Accessing the speech recognition features from the custom hook
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();

  const micStyle = {
    position: "fixed",
    bottom: "-5%",
    left: "50%",
    transform: "translateX(-50%)",
    width: "12%",
  };

  useEffect(() => {
    if (!listening && transcript) {
      // User has recorded and there is a new topic
      setTimeout(() => {
        onSubmitNewTopic(transcript);
      }, 1000);
    }
  }, [listening]);

  // Effect to manage speech recognition state
  useEffect(() => {
    if (browserSupportsSpeechRecognition) {
      if (isRecording) {
        SpeechRecognition.startListening();
      } else {
        SpeechRecognition.stopListening();
      }
    }
  }, [isRecording]);

  function handleStartStopRecording() {
    setIsRecording(!isRecording); // Toggle the recording state
  }

  return (
    <div>
      <textarea
        value={transcript}
        rows="2"
        placeholder="Speak your mind"
        readOnly
      />
      <div style={{ pointerEvents: "auto" }}>
        <button onClick={handleStartStopRecording}>
          {!isRecording ? "Start recording" : "Stop recording"}
        </button>
        <button onClick={() => onSubmitNewTopic(transcript)}>Submit</button>
      </div>
      <img
        src="/images/mic.png"
        style={micStyle}
      />
    </div>
  );
}

export default HumanInput;
