import React, { useEffect, useRef } from "react";

function AudioOutput({ currentAudioMessage, onFinishedPlaying }) {
  const audioRef = useRef(null);
  const urlRef = useRef(null);
  const checkPlaybackIntervalRef = useRef(null);

  useEffect(() => {
    // Initialize the audio element if it does not exist
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    return () => {
      // Clean up audio element and interval
      clearInterval(checkPlaybackIntervalRef.current);
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

      // Auto-play the new audio
      audioRef.current
        .play()
        .catch((err) => console.error("Error playing audio:", err));

      // Start checking audio playback status
      checkPlaybackIntervalRef.current = setInterval(checkPlaybackStatus, 500);
    }
  }, [currentAudioMessage]);

  const checkPlaybackStatus = () => {
    if (
      audioRef.current &&
      audioRef.current.currentTime >= audioRef.current.duration
    ) {
      // Audio playback has ended
      clearInterval(checkPlaybackIntervalRef.current);
      onFinishedPlaying();
    }
  };

  return null; // This component does not render anything itself
}

export default AudioOutput;
