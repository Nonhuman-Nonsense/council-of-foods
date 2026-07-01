import { useState, useEffect, useRef } from "react";
import { useMobile } from "@/utils";
import { z } from "@/zIndexLayers";
import { Sentence } from "@shared/ModelTypes";
import React from 'react';
import type { PlaybackStartInfo } from "./AudioOutputMessage";

interface AudioMessage {
  id?: string;
  sentences?: Sentence[];
}

interface TextOutputProps {
  currentAudioMessage: AudioMessage | null;
  audioContext: React.RefObject<AudioContext | null>;
  playbackStartInfo: PlaybackStartInfo | null;
  isPaused: boolean;
  setCurrentSnippetIndex: (index: number) => void;
  style?: React.CSSProperties;
}

/**
 * TextOutput Component
 * 
 * Handles the synchronized display of subtitles based on absolute audio timing.
 * 
 * Core Logic:
 * - **Audio Clock Timing**: Derives subtitle position from `AudioContext.currentTime`, matching WebAudio playback.
 * - **High Performance**: Uses `requestAnimationFrame` (~60fps) loop instead of `setInterval`.
 * - **O(1) Lookup**: Maintains a `searchCursorRef` to find the current sentence without re-scanning the array.
 * - **Render Safety**: Updates Refs inside the loop to track state without triggering unnecessary re-renders.
 */
function TextOutput({
  currentAudioMessage, // Data structure: { sentences: [{text, start, end}, ...] }
  audioContext,
  playbackStartInfo,
  isPaused,
  setCurrentSnippetIndex, // Parent state setter
  style
}: TextOutputProps): React.ReactElement {
  // --- LOCAL STATE ---
  // The text currently visible on screen. 
  // Only updated when the sentence actually changes.
  const [currentSnippet, setCurrentSnippet] = useState<string>("");

  // --- TIMING REFS (Mutable values that don't trigger re-renders) ---

  // 1. requestRef: Stores the ID of the animation frame so we can cancel it cleanup.
  const requestRef = useRef<number | null>(null);

  // 2. searchCursorRef: PERFORMANCE OPTIMIZATION
  //    Tracks the index of the last found sentence.
  //    Since audio only moves forward, we don't need to search the array from 0 every frame.
  const searchCursorRef = useRef<number>(0);

  // 3. lastDisplayedTextRef: RENDER SAFETY
  //    Tracks the text we last sent to the state.
  //    This allows us to check if the text needs updating *inside* the loop
  //    without reading the 'currentSnippet' state (which would be stale).
  const lastDisplayedTextRef = useRef<string>("");

  const isMobile = useMobile();

  // ---------------------------------------------------------------------------
  // EFFECT 1: INITIALIZATION & RESET
  // Runs whenever a completely new audio message is loaded.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // 1. Strict cleanup: stop any running loops from previous messages
    if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);

    // 2. Reset timing trackers to zero
    searchCursorRef.current = 0;

    // 3. Reset UI state
    setCurrentSnippetIndex(0);
    setCurrentSnippet("");
    lastDisplayedTextRef.current = "";

    const sentences = currentAudioMessage?.sentences || [];

    // 4. Initialize with the first sentence if available
    if (sentences.length > 0) {
      const firstText = sentences[0].text;
      setCurrentSnippet(firstText);
      lastDisplayedTextRef.current = firstText;

    }
  }, [currentAudioMessage, setCurrentSnippetIndex]);


  // ---------------------------------------------------------------------------
  // EFFECT 2: THE SYNC LOOP
  // Handles Play/Pause toggling and the per-frame timing calculations.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const sentences = currentAudioMessage?.sentences || [];
    if (sentences.length === 0) return;
    if (!playbackStartInfo || playbackStartInfo.messageId !== currentAudioMessage?.id) return;
    if (!audioContext.current) return;

    // CASE A: PAUSED
    if (isPaused) {
      // Stop the CPU-intensive loop
      if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);

    } else {
      // CASE B: PLAYING

      // -- THE ANIMATION FRAME FUNCTION --
      // This runs ~60 times per second while playing
      const animate = () => {
        const context = audioContext.current;
        if (!context) return;

        // 1. Calculate Absolute Audio Time (in Seconds)
        const currentAudioTime = Math.max(
          0,
          context.currentTime - playbackStartInfo.startedAtAudioContextTime
        );

        // 2. Find the correct sentence (Using O(1) Cursor Optimization)
        let foundIndex = -1;

        // Start searching from our last known position (searchCursorRef), not 0.
        // We assume time only moves forward.
        for (let i = searchCursorRef.current; i < sentences.length; i++) {
          const s = sentences[i];
          const nextSentence = sentences[i + 1];

          // A sentence is active if:
          // A. Time >= Start
          // B. Time < NextSentence.Start (Fill the gap until the next one starts)
          const isAfterStart = currentAudioTime >= s.start;
          const isBeforeNext = nextSentence ? currentAudioTime < nextSentence.start : true;

          if (isAfterStart && isBeforeNext) {
            foundIndex = i;
            // Update cursor so next frame starts search here
            searchCursorRef.current = i;
            break;
          }

          // Optimization: If we haven't even reached this sentence's start yet,
          // there is no point checking sentences further in the future.
          if (currentAudioTime < s.start) {
            break;
          }
        }

        // 3. Update the UI (Only if the sentence actually changed)
        if (foundIndex !== -1) {
          const newText = sentences[foundIndex].text;

          // CRITICAL: Check 'lastDisplayedTextRef' instead of state.
          // This prevents "Cannot update component while rendering" errors.
          if (lastDisplayedTextRef.current !== newText) {

            // A. Update the Ref immediately (so the next frame knows we did it)
            lastDisplayedTextRef.current = newText;

            // B. Update Local State (Triggers the visual update)
            setCurrentSnippet(newText);

            // C. Update Parent State (Safe here because we are outside the render phase)
            setCurrentSnippetIndex(foundIndex);
          }
        }

        // 4. Request the next frame
        requestRef.current = requestAnimationFrame(animate);
      };

      // Start the loop
      requestRef.current = requestAnimationFrame(animate);
    }

    // Cleanup: If the component unmounts or inputs change, kill the loop
    return () => {
      if (requestRef.current !== null) cancelAnimationFrame(requestRef.current);
    }
  }, [isPaused, currentAudioMessage, audioContext, playbackStartInfo, setCurrentSnippetIndex]);


  // --- STYLING ---
  const paragraphStyle: React.CSSProperties = {
    fontFamily: "Arial, sans-serif",
    fontSize: isMobile ? "18px" : "25px",
    margin: isMobile ? "0" : undefined,
  };

  const textStyle: React.CSSProperties = {
    maxWidth: isMobile ? "85%" : "70%",
    zIndex: z.councilControls,
    pointerEvents: 'auto'
  };

  return (
    <div style={{ ...textStyle, ...style }}>
      <p style={paragraphStyle} data-testid="subtitle-text">{currentSnippet}</p>
    </div>
  );
}

export default TextOutput;