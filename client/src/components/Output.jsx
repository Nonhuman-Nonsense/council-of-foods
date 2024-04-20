import React, { useState, useEffect } from "react";
import TextOutput from "./TextOutput";
import ConversationControls from "./ConversationControls";

function Output({ conversation }) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [currentSnippetIndex, setCurrentSnippetIndex] = useState(0);
  const [currentMessageTextSnippet, setCurrentMessageTextSnippet] =
    useState("");
  const [initialize, setInitialize] = useState(true); // Flag to control initialization
  const [isPaused, setIsPaused] = useState(false);

  // Function to calculate the display time based on text length
  const calculateDisplayTime = (text) => Math.max(3, text.length * 0.05);

  function handlePauseResume() {
    if (!isPaused) {
      console.log("Pausing");
    } else {
      console.log("Resuming");
    }

    setIsPaused(!isPaused);
  }

  function handleSkipForward() {
    // TODO: See if last message before skipping forward

    console.log("Skipping forward");
  }

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
      <h2>
        Speaker:{" "}
        {conversation.length > 0
          ? conversation[currentMessageIndex].speaker
          : ""}
      </h2>
      <TextOutput currentMessageTextSnippet={currentMessageTextSnippet} />
      <AudioOutput />
      <ConversationControls
        isPaused={isPaused}
        onPauseResume={handlePauseResume}
        onSkipForward={handleSkipForward}
      />
    </div>
  );
}

export default Output;
