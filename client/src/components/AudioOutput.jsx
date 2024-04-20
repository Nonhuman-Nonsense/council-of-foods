// In the AudioOutput component
import React, { useEffect, useRef } from "react";

function AudioOutput({ currentAudioMessage }) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (currentAudioMessage) {
      console.log(
        "Creating blob with ArrayBuffer of size:",
        currentAudioMessage.audio.byteLength
      );
      const blob = new Blob([currentAudioMessage.audio], { type: "audio/mp3" });
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
  }, [currentAudioMessage]);

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
