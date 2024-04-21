// In the AudioOutput component
import React, { useEffect, useRef } from "react";

function AudioOutput({ currentAudioMessage }) {
  const audioRef = useRef(null);

  useEffect(() => {
    if (currentAudioMessage) {
      const blob = new Blob([currentAudioMessage.audio], { type: "audio/mp3" });
      const url = URL.createObjectURL(blob);
      audioRef.current.src = url;
      audioRef.current
        .play()
        .catch((err) => console.error("Error playing audio:", err));

      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [currentAudioMessage]);

  return (
    <audio
      ref={audioRef}
      controls
      autoPlay
    />
  );
}

export default AudioOutput;
