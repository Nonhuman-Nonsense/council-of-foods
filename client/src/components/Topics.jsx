import React, { useState, useRef, useEffect } from "react";
import ResetWarning from "./ResetWarning";
import { capitalizeFirstLetter } from "../utils";

function Topics(props) {
  const [selectedTopic, setSelectedTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [displayWarning, setDisplayWarning] = useState(false);
  const topicTextareaRef = useRef(null);

  // Topics array remains unchanged
  const topics = [
    "seed patents and ownership",
    "labour conditions & modern slavery",
    "modern agriculture & biodiversity loss",
    "local & global food chains",
    "nature - culture: traditions and progress",
    "choose your own",
  ];

  // useEffect hook to listen for changes in props.currentTopic
  useEffect(() => {
    if (props.currentTopic) {
      selectTopic(props.currentTopic);
    }
  }, [props.currentTopic]); // Dependency array includes only currentTopic

  // Function to set selectedTopic and focus on textarea if needed
  function selectTopic(topic) {
    // Check if the topic is in the predefined list or not
    const topicExists = topics.some(
      (t) => t.toLowerCase() === topic.toLowerCase()
    );

    if (topicExists) {
      setSelectedTopic(topic);
    } else {
      // If the topic is not in the list, consider it a custom topic
      setCustomTopic(topic); // Set the unrecognized topic as the custom topic
      setSelectedTopic("choose your own"); // Automatically select "choose your own"
    }

    // Focus on the textarea if "choose your own" is selected
    if (!topicExists || topic.toLowerCase() === "choose your own") {
      setTimeout(() => {
        topicTextareaRef.current && topicTextareaRef.current.focus();
      }, 0);
    }
  }

  // Function to customize button style based on selected topic
  function topicButtonStyle(topic) {
    return {
      marginBottom: "15px",
      borderColor:
        selectedTopic === topic ? "white" : "rgba(255, 255, 255, 0.5)",
    };
  }

  // Function to handle custom topic input changes
  function handleInputTopic(e) {
    const newTopic = e.target.value;
    const capitalizedTopic = capitalizeFirstLetter(newTopic);
    setCustomTopic(capitalizedTopic);
  }

  // Function to proceed with the selected or custom topic
  function onContinueForward() {
    if (props.currentTopic) {
      // Current topic exists which means we are changing settings
      setDisplayWarning(true);
    } else {
      const topic = getTopic();
      props.onContinueForward({ topic });
    }
  }

  function getTopic() {
    const topic =
      selectedTopic.toLowerCase() === "choose your own"
        ? customTopic
        : selectedTopic;

    return topic;
  }

  // Conditional rendering for showing the Next button
  const shouldShowNextButton =
    selectedTopic &&
    !(selectedTopic.toLowerCase() === "choose your own" && !customTopic.trim());

  return (
    <>
      {displayWarning ? (
        <ResetWarning
          message="changing settings"
          onReset={() => props.onReset(getTopic())}
          onCancel={props.onCancel}
        />
      ) : (
          <div className="text-container">
            <h1>THE ISSUE:</h1>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "start",
              }}
            >
              {topics.map((topic, index) => (
                <button
                  key={index}
                  className="outline-button wide-button"
                  onClick={() => selectTopic(topic)}
                  style={topicButtonStyle(topic)}
                >
                  {topic}
                </button>
              ))}
              <h4>please select an issue for the discussion</h4>
            </div>
            <textarea
              ref={topicTextareaRef}
              className={`${
                selectedTopic === "choose your own" ? "" : "hidden"
              } text-input`}
              rows="2"
              value={customTopic}
              placeholder="your topic"
              onChange={handleInputTopic}
              style={{ width: "80%" }}
            />
            <button
              className={`${
                shouldShowNextButton ? "" : "hidden"
              } outline-button`}
              onClick={onContinueForward}
            >
              Next
            </button>
          </div>
      )}
    </>
  );
}

export default Topics;
