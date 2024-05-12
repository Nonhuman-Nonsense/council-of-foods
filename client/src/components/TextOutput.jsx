import React, { useState, useEffect, useRef } from "react";
import { useMobile } from "../utils";

function TextOutput({
  currentTextMessage,
  currentAudioMessage,
  isPaused,
  setZoomIn,
}) {
  const [currentSnippetIndex, setCurrentSnippetIndex] = useState(0);
  const [currentSnippet, setCurrentSnippet] = useState("");

  const [currentSnippetDelay, setCurrentSnippetDelay] = useState(0);
  const [snippetStartTime, setSnippetStartTime] = useState(0);
  const [remainingTime, setRemainingTime] = useState(0);
  const [wasPaused, setWasPaused] = useState(false);
  const timerId = useRef(null);
  const isMobile = useMobile();

  // const splitText = (text) => {
  //   return (
  //     text.match(/(\d+\.\s.*?(?=\d+\.\s|$)|.*?(?=[.!?])(?:[.!?]|$))/gs) || [
  //       text,
  //     ]
  //   );
  // };

  // Function to split text into sentences, handling newlines and ending without period
  const splitText = (text) => {
    // Normalize newlines to periods to uniformly handle them as sentence breaks
    const normalizedText = text.replace(/\n/g, ". ");

    // Regex to capture sentences or numbered list items
    const sentenceRegex = /(\d+\.\s+[^.]+)|[^.]+(\.|$)/g;

    return normalizedText
      .match(sentenceRegex)
      .map((sentence) => sentence.trim());
  };

  useEffect(() => {
    if (isPaused) {
      clearTimeout(timerId.current);
      setRemainingTime(currentSnippetDelay - (Date.now() - snippetStartTime));
      setWasPaused(true);
    } else if (wasPaused) {
      setWasPaused(false);
      setCurrentSnippetDelay(remainingTime);
      setSnippetStartTime(Date.now());
      const sentences = splitText(currentTextMessage?.text || "");

      // Don't set a timer if we are on the last snippet
      if (currentSnippetIndex < sentences.length - 1) {
        timerId.current = setTimeout(() => {
          setCurrentSnippetIndex((prevIndex) =>
            prevIndex < sentences.length - 1 ? prevIndex + 1 : prevIndex
          );
        }, remainingTime);
      }
    }
  }, [isPaused]);

  // Reset the snippet index and snippet when a new message is received
  useEffect(() => {
    setCurrentSnippetIndex(0);
    if (currentTextMessage?.text) {
      const sentences = splitText(currentTextMessage?.text);
      if (sentences.length > 0) {
        const namePrefix =
          currentTextMessage.type === "human"
            ? currentTextMessage.speaker + ": "
            : "";
        setCurrentSnippet(namePrefix + sentences[0]);
      } else {
        setCurrentSnippet("");
      }
    }
  }, [currentTextMessage]);

  useEffect(() => {
    if (currentSnippetIndex >= 0 && currentTextMessage?.text) {
      const sentences = splitText(currentTextMessage?.text);

      if (sentences.length > currentSnippetIndex) {
        const namePrefix =
          currentTextMessage.type === "human"
            ? currentTextMessage.speaker + ": "
            : "";
        setCurrentSnippet(namePrefix + sentences[currentSnippetIndex]);
      }

      // Store the current delay, and the time when it started
      const delay = calculateDisplayTime(sentences[currentSnippetIndex] || "");
      setCurrentSnippetDelay(delay);
      setSnippetStartTime(Date.now());

      // Don't set a timer if we are on the last snippet
      if (currentSnippetIndex < sentences.length - 1) {
        if (!isPaused) {
          timerId.current = setTimeout(() => {
            setCurrentSnippetIndex((prevIndex) =>
              prevIndex < sentences.length - 1 ? prevIndex + 1 : prevIndex
            );
          }, delay);
        } else {
          // Handle special case where council is paused before the first message
          clearTimeout(timerId.current);
          setRemainingTime(delay);
          setWasPaused(true);
        }
      }

      return () => clearTimeout(timerId.current);
    }
  }, [currentSnippetIndex, currentTextMessage]);

  useEffect(() => {
    if (currentTextMessage?.type !== "human" && currentTextMessage?.purpose !== "summary") {
      // Zoom in on 2 snippets, out on 2, etc.
      setZoomIn(currentSnippetIndex % 4 < 2);
    }
  }, [currentSnippetIndex, currentTextMessage]);

  // Modify calculateDisplayTime to handle potential undefined or empty strings safely
  const calculateDisplayTime = (text) => {
    if (!text) {
      return 1500; // Minimum display time if text is undefined or empty
    }
    const baseTimePerCharacter = 0.06; // Adjust this value as needed
    return Math.round(Math.max(1.5, text.length * baseTimePerCharacter) * 1000);
  };

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
  };

  return (
    <div style={textStyle}>
      <p style={paragraphStyle}>{currentSnippet}</p>
    </div>
  );
}

export default TextOutput;
