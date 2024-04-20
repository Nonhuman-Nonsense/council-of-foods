import React, { useState, useEffect } from "react";
import TextOutput from "./TextOutput";
import AudioOutput from "./AudioOutput";
import ConversationControls from "./ConversationControls";

function Output({ conversation, audioMessages }) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [currentSnippetIndex, setCurrentSnippetIndex] = useState(0);
  const [currentMessageTextSnippet, setCurrentMessageTextSnippet] =
    useState("");
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    console.log("Audio buffers length:", audioMessages.length);
    console.log("Current audio buffer index:", currentMessageIndex);
  }, [audioMessages, currentMessageIndex]);

  useEffect(() => {
    if (conversation.length > 0 && !isPaused) {
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

        return () => clearTimeout(timeout); // Cleanup timeout on unmount or dependency change
      }
    }
  }, [currentMessageIndex, currentSnippetIndex, conversation, isPaused]); // Include isPaused in dependencies

  const calculateDisplayTime = (text) => Math.max(3, text.length * 0.065);

  function handlePauseResume() {
    setIsPaused(!isPaused); // Toggle pause state
  }

  function handleSkipForward() {
    if (conversation.length > currentMessageIndex) {
      const snippets =
        conversation[currentMessageIndex].text.split(/(?<=\.\s)/);
      if (currentSnippetIndex < snippets.length - 1) {
        // Move to the next snippet within the same message
        setCurrentSnippetIndex(currentSnippetIndex + 1);
      } else if (currentMessageIndex < conversation.length - 1) {
        // Move to the first snippet of the next message
        setCurrentMessageIndex(currentMessageIndex + 1);
        setCurrentSnippetIndex(0);
      }
    }
  }

  return (
    <div style={{ textAlign: "center", width: "75%" }}>
      <h2>
        Speaker:{" "}
        {conversation.length > 0
          ? conversation[currentMessageIndex].speaker
          : ""}
      </h2>
      <TextOutput currentMessageTextSnippet={currentMessageTextSnippet} />
      <AudioOutput
        currentAudioMessage={audioMessages.find(
          (a) => a.message_index == currentMessageIndex
        )}
      />
      <ConversationControls
        isPaused={isPaused}
        onPauseResume={handlePauseResume}
        onSkipForward={handleSkipForward}
      />
    </div>
  );
}

export default Output;
