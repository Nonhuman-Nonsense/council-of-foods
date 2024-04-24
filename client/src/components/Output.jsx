import React, { useState, useEffect } from "react";
import TextOutput from "./TextOutput";
import AudioOutput from "./AudioOutput";
import ConversationControls from "./ConversationControls";

function Output({ conversation, audioMessages }) {
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  const [currentSnippetIndex, setCurrentSnippetIndex] = useState(0);
  const [currentMessageTextSnippet, setCurrentMessageTextSnippet] =
    useState("");
  const [currentAudioMessage, setCurrentAudioMessage] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [isPaused, setIsPaused] = useState(true); // Assume initially paused until ready

  useEffect(() => {
    console.log("Updated audioMessages");
  }, [audioMessages]);

  useEffect(() => {
    // Find the audio message only when currentMessageIndex changes
    const foundAudioMessage = audioMessages.find(
      (a) => a.message_index === currentMessageIndex
    );
    if (foundAudioMessage) {
      setCurrentAudioMessage(foundAudioMessage);
      setIsReady(true);
      setIsPaused(false); // Start playing the new message immediately
    }
  }, [currentMessageIndex, audioMessages]); // Include audioMessages to update the message if it changes

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
        return () => clearTimeout(timeout);
      }
    }
  }, [currentMessageIndex, currentSnippetIndex, conversation, isPaused]);

  const calculateDisplayTime = (text) => {
    const baseTimePerCharacter = 0.052; // Time per character in seconds
    const baseTime = Math.max(3, text.length * baseTimePerCharacter);
    const additionalTimeForCommas = (text.match(/,/g) || []).length * 0.5; // 0.4 seconds for each comma
    return baseTime + additionalTimeForCommas;
  };

  function handlePauseResume() {
    setIsPaused(!isPaused);
  }

  function handleSkipForward() {
    if (currentMessageIndex < conversation.length - 1) {
      const newIndex = currentMessageIndex + 1;
      setCurrentMessageIndex(newIndex);
      setCurrentSnippetIndex(0);
      // Update the current audio message immediately when skipping
      const newAudioMessage = audioMessages.find(
        (a) => a.message_index === newIndex
      );
      setCurrentAudioMessage(newAudioMessage);
      setIsPaused(false); // Optionally start playing the new message immediately
    }
  }

  return (
    <div style={{ textAlign: "center", width: "75%" }}>
      {isReady ? (
        <>
          <h2>
            Speaker:{" "}
            {conversation.length > 0
              ? conversation[currentMessageIndex].speaker
              : ""}
          </h2>
          <TextOutput currentMessageTextSnippet={currentMessageTextSnippet} />
          <AudioOutput
            currentAudioMessage={currentAudioMessage}
            isPaused={isPaused}
          />
          <ConversationControls
            isPaused={isPaused}
            onPauseResume={handlePauseResume}
            onSkipForward={handleSkipForward}
          />
        </>
      ) : (
        <h3>The council is getting ready...</h3>
      )}
    </div>
  );
}

export default Output;
