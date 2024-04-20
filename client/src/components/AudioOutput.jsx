// In the AudioOutput component
import React, { useEffect, useRef } from "react";

function AudioOutput({ currentAudioBuffer }) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (currentAudioBuffer) {
      console.log(
        "Creating blob with ArrayBuffer of size:",
        currentAudioBuffer.byteLength
      );
      const blob = new Blob([currentAudioBuffer], { type: "audio/mp3" });
      const url = URL.createObjectURL(blob);
      console.log("Blob URL:", url); // Check the generated URL
      audioRef.current.src = url;
      audioRef.current
        .play()
        .catch((err) => console.error("Error playing audio:", err));

      return () => {
        console.log("Revoking URL:", url);
        URL.revokeObjectURL(url);
      };
    }
  }, [currentAudioBuffer]);

  return (
    <audio
      ref={audioRef}
      controls
      autoPlay
      onLoadedData={() => console.log("Audio loaded")}
    />
  );
}

export default AudioOutput;
