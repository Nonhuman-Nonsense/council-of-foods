import { useState, useEffect, useRef } from "react";
import { useMobile } from "../utils";

function TextOutput({
  currentTextMessage,
  currentAudioMessage, // Expects: { sentences: [{text, start, end}, ...] }
  isPaused,
  setCurrentSnippetIndex,
  setSentencesLength
}) {
  const [currentSnippet, setCurrentSnippet] = useState("");
  
  // REFS: We use refs for timing to avoid re-renders causing jitter
  const startTimeRef = useRef(null);      // When the current "play segment" started
  const accumulatedTimeRef = useRef(0);   // Total time played before the current pause
  const requestRef = useRef(null);        // ID for the animation frame loop
  
  const isMobile = useMobile();

  // 1. RESET: When a NEW audio message arrives, reset all timers
  useEffect(() => {
    // Stop any running loop
    cancelAnimationFrame(requestRef.current);
    
    // Reset internal timing state
    startTimeRef.current = null;
    accumulatedTimeRef.current = 0;
    
    // Reset parent/UI state
    setCurrentSnippetIndex(0);
    setCurrentSnippet("");

    const sentences = currentAudioMessage?.sentences || [];
    setSentencesLength(sentences.length);

    // Initialize with the first sentence if available
    if (sentences.length > 0) {
      setCurrentSnippet(sentences[0].text);
      // If we are already playing (autoplay), set the start time immediately
      if (!isPaused) {
        startTimeRef.current = Date.now();
      }
    }
  }, [currentAudioMessage, setSentencesLength, setCurrentSnippetIndex]);


  // 2. THE SYNC LOOP: Runs whenever pause state changes or message updates
  useEffect(() => {
    const sentences = currentAudioMessage?.sentences || [];
    if (sentences.length === 0) return;

    if (isPaused) {
      // --- PAUSED STATE ---
      // If we were playing, calculate how much time passed and save it
      if (startTimeRef.current !== null) {
        const sessionDuration = Date.now() - startTimeRef.current;
        accumulatedTimeRef.current += sessionDuration;
        startTimeRef.current = null; // Mark as stopped
      }
      cancelAnimationFrame(requestRef.current);
    
    } else {
      // --- PLAYING STATE ---
      // If just starting (or resuming), mark the new start time
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
      }

      const animate = () => {
        // A. Calculate exact position in the audio clip (in seconds)
        const now = Date.now();
        const totalElapsedMS = accumulatedTimeRef.current + (now - startTimeRef.current);
        const currentAudioTime = totalElapsedMS / 1000;

        // B. Find the active sentence based on Absolute Time
        // We look for a sentence that has started (start <= time)
        // AND where the NEXT sentence hasn't started yet.
        const activeIndex = sentences.findIndex((s, i) => {
          const nextSentence = sentences[i + 1];
          
          const isAfterStart = currentAudioTime >= s.start;
          // If there is a next sentence, check if we are before it. 
          // If not, we are definitely in the last sentence.
          const isBeforeNext = nextSentence ? currentAudioTime < nextSentence.start : true;
          
          return isAfterStart && isBeforeNext;
        });

        // C. Update State (Only if changed to avoid unnecessary re-renders)
        if (activeIndex !== -1) {
          setCurrentSnippet((prev) => {
            if (prev !== sentences[activeIndex].text) {
              setCurrentSnippetIndex(activeIndex);
              return sentences[activeIndex].text;
            }
            return prev;
          });
        }

        // D. Keep looping
        requestRef.current = requestAnimationFrame(animate);
      };

      // Kick off the loop
      requestRef.current = requestAnimationFrame(animate);
    }

    // Cleanup: Stop loop on unmount or dependency change
    return () => cancelAnimationFrame(requestRef.current);
  }, [isPaused, currentAudioMessage, setCurrentSnippetIndex]);


  // --- STYLES ---
  const paragraphStyle = {
    fontFamily: "Arial, sans-serif",
    fontSize: isMobile ? "18px" : "25px",
    margin: isMobile && "0",
  };

  const textStyle = {
    width: isMobile ? "85%" : "70%",
    position: "absolute",
    bottom: isMobile ? "40px" : "50px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "3",
    pointerEvents: 'auto'
  };

  return (
    <div style={textStyle}>
      <p style={paragraphStyle}>{currentSnippet}</p>
    </div>
  );
}

export default TextOutput;