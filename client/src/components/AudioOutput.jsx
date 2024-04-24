import React, { useEffect, useRef } from "react";

function AudioOutput({ currentAudioMessage, isPaused }) {
  const audioRef = useRef(null);
  const urlRef = useRef(null);

  useEffect(() => {
    // Initialize the audio element if it does not exist
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    return () => {
      audioRef.current && audioRef.current.pause();
    };
  }, []);

  useEffect(() => {
    // Handle updating the audio source when the message changes
    if (currentAudioMessage) {
      // Revoke the old URL to avoid memory leaks
      if (urlRef.current?.url) {
        URL.revokeObjectURL(urlRef.current.url);
      }
      // Create a new URL for the updated audio blob
      const blob = new Blob([currentAudioMessage.audio], { type: "audio/mp3" });
      urlRef.current = {
        url: URL.createObjectURL(blob),
        id: currentAudioMessage.id,
      };
      audioRef.current.src = urlRef.current.url;
      audioRef.current.load();

      // Auto-play the new audio if not paused
      if (!isPaused) {
        audioRef.current
          .play()
          .catch((err) => console.error("Error playing audio:", err));
      }
    }
  }, [currentAudioMessage]);

  useEffect(() => {
    // Manage playback based on isPaused state
    if (!isPaused && currentAudioMessage) {
      audioRef.current
        .play()
        .catch((err) => console.error("Error playing audio:", err));
    } else {
      audioRef.current.pause();
    }
  }, [isPaused]);

  return null; // This component does not render anything itself
}

export default AudioOutput;
