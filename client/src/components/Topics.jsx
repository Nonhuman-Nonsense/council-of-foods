import React, { useState, useRef } from "react";
import { capitalizeFirstLetter } from "../utils";

function Topics(props) {
  const [selectedTopic, setSelectedTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const topicTextareaRef = useRef(null);

  const topics = [
    "seed patents and ownership",
    "labour conditions & modern slavery",
    "modern agriculture & biodiversity loss",
    "local & global food chains",
    "nature - culture: traditions and progress",
    "choose your own",
  ];

  const shouldShowNextButton =
    selectedTopic &&
    !(selectedTopic.toLowerCase() === "choose your own" && !customTopic.trim());

  function selectTopic(topic) {
    setSelectedTopic(topic);

    if (topic.toLowerCase() === "choose your own") {
      // Set a slight delay before focusing to ensure the textarea is visible
      setTimeout(() => {
        topicTextareaRef.current && topicTextareaRef.current.focus();
      }, 0);
    }
  }

  function topicButtonStyle(topic) {
    return {
      marginBottom: "15px",
      borderColor:
        selectedTopic === topic ? "white" : "rgba(255, 255, 255, 0.5)",
    };
  }

  function handleInputTopic(e) {
    const newTopic = e.target.value;

    const capitalizedTopic = capitalizeFirstLetter(newTopic);

    setCustomTopic(capitalizedTopic);
  }

  function onContinueForward() {
    if (selectedTopic.toLowerCase() === "choose your own") {
      props.onContinueForward({ topic: customTopic });
    } else {
      props.onContinueForward({ topic: selectedTopic });
    }
  }

  return (
    <div className="wrapper">
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
          cols="30"
          value={customTopic}
          placeholder="your topic"
          onChange={handleInputTopic}
        />
        <button
          className={`${shouldShowNextButton ? "" : "hidden"} outline-button`}
          onClick={onContinueForward}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default Topics;
