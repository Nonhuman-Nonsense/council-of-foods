import React, { useState } from "react";

function HumanInput({ onInputNewTopic, onStopRecording }) {
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);

  // Function to start recording
  const startRecording = () => {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const newMediaRecorder = new MediaRecorder(stream);
        setMediaRecorder(newMediaRecorder);

        newMediaRecorder.start();
        setRecording(true);

        let audioChunks = [];
        newMediaRecorder.ondataavailable = (event) => {
          audioChunks.push(event.data);
        };

        newMediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: "audio/mp4" });
          const audioUrl = URL.createObjectURL(audioBlob);

          console.log("Stopping recording...");

          // Optionally handle the audio blob by sending it to a parent component
          onStopRecording(audioUrl); // Sending the URL for the audio blob to the parent
          audioChunks = []; // Clear chunks
        };
      })
      .catch((error) => {
        console.error("Error accessing the microphone:", error);
      });
  };

  // Function to stop recording
  const stopRecording = () => {
    if (mediaRecorder) {
      mediaRecorder.stop();
      setRecording(false);
    }
  };

  function handleOnInput(e) {
    onInputNewTopic(e.target.value);
  }

  return (
    <div style={{ pointerEvents: "auto" }}>
      <textarea
        onInput={handleOnInput}
        rows="2"
        placeholder="your input"
      />
      <div>
        <button
          onClick={startRecording}
          disabled={recording}
        >
          Start Recording
        </button>
        <button
          onClick={stopRecording}
          disabled={!recording}
        >
          Stop Recording
        </button>
      </div>
    </div>
  );
}

export default HumanInput;
