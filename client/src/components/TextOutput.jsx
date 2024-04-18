import React, { useState, useEffect, useRef } from "react";

function TextOutput({ conversation }) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [currentSnippetIndex, setCurrentSnippetIndex] = useState(0);
  const [currentMessageTextSnippet, setCurrentMessageTextSnippet] =
    useState("");
  const [initialize, setInitialize] = useState(true); // Flag to control initialization
  const textOutputStyle = {
    fontFamily: "Arial, sans-serif",
  };

  // Function to calculate the display time based on text length
  const calculateDisplayTime = (text) => Math.max(3, text.length * 0.05);

  useEffect(() => {
    if (initialize && conversation.length > 0) {
      setCurrentMessageIndex(0);
      setCurrentSnippetIndex(0);
      setInitialize(false); // Reset initialization flag after first setup
    }
  }, [conversation, initialize]);

  useEffect(() => {
    const processSnippets = () => {
      if (conversation.length > currentMessageIndex) {
        const snippets =
          conversation[currentMessageIndex].text.split(/(?<=\.\s)/);
        if (snippets.length > currentSnippetIndex) {
          setCurrentMessageTextSnippet(snippets[currentSnippetIndex]);
          const timeout = setTimeout(() => {
            if (currentSnippetIndex < snippets.length - 1) {
              setCurrentSnippetIndex(currentSnippetIndex + 1);
            } else if (currentMessageIndex < conversation.length - 1) {
              setCurrentMessageIndex(currentMessageIndex + 1);
              setCurrentSnippetIndex(0);
            }
          }, calculateDisplayTime(snippets[currentSnippetIndex]) * 1000);
          return () => clearTimeout(timeout);
        }
      }
    };

    processSnippets();
  }, [currentMessageIndex, currentSnippetIndex, conversation]);

  return (
    <div>
      <h2 style={textOutputStyle}>
        Speaking:{" "}
        {conversation.length > 0
          ? conversation[currentMessageIndex].speaker
          : ""}
      </h2>
      <h2 style={textOutputStyle}>{currentMessageTextSnippet || ""}</h2>
    </div>
  );
}

export default TextOutput;
