import React, { useState, useEffect } from "react";

function TextOutput({ currentTextMessage, currentAudioMessage }) {
  const [currentSnippetIndex, setCurrentSnippetIndex] = useState(0);
  const [currentSnippet, setCurrentSnippet] = useState("");

  // Reset the snippet index when a new message is received
  useEffect(() => {
    setCurrentSnippetIndex(0);
  }, [currentTextMessage]);

  useEffect(() => {
    if (currentTextMessage && currentTextMessage.text && currentAudioMessage) {
      const text = currentTextMessage.text;
      // Split the text into sentences, ignoring periods followed by a number
      const sentences = text.split(/(?<=[.!?])(?=\s+(?![0-9]))/);
      setCurrentSnippet(sentences[currentSnippetIndex]);

      const interval = setInterval(() => {
        setCurrentSnippetIndex((prevIndex) =>
          prevIndex < sentences.length - 1 ? prevIndex + 1 : prevIndex
        );
      }, calculateDisplayTime(currentSnippet) * 1000);
      return () => clearInterval(interval);
    }
  }, [
    currentTextMessage,
    currentSnippetIndex,
    currentAudioMessage,
    currentSnippet,
  ]);

  // Calculate the display time based on the number of characters in the snippet
  const calculateDisplayTime = (text) => {
    const baseTimePerCharacter = 0.06; // Adjust this value as needed
    return Math.max(3, text.length * baseTimePerCharacter);
  };

  const paragraphStyle = {
    fontFamily: "Arial, sans-serif",
    fontSize: "25px",
  }

  const textStyle = {
    width: "70%",
    position: "absolute",
    bottom: "50px",
  }

  return (
    <div style={textStyle}>
      <p style={paragraphStyle}>
        {currentSnippet}
      </p>
    </div>
  );
}

export default TextOutput;
