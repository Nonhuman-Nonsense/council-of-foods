import React, { useState, useRef, useEffect } from "react";
import ResetWarning from "../overlays/ResetWarning";
import topicData from "../../prompts/topics.json";
import { capitalizeFirstLetter, toTitleCase, useMobile } from "../../utils";

function SelectTopic(props) {
  const [selectedTopic, setSelectedTopic] = useState({
    title: "",
    description: "",
    prompt: "",
  });
  const [hoverTopic, setHoverTopic] = useState({});
  const [customTopic, setCustomTopic] = useState("");
  const [displayWarning, setDisplayWarning] = useState(false);
  const topicTextareaRef = useRef(null);
  const isMobile = useMobile();

  const topics = [
    ...topicData.topics,
    { title: "choose your own", prompt: "", description: "" },
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
      (t) => t.title.toLowerCase() === topic.title.toLowerCase()
    );

    if (topicExists) {
      setSelectedTopic(topic);
    } else {
      // If the topic is not in the list, consider it a custom topic
      setCustomTopic(topic.title.substring(0, 150)); // Set the unrecognized topic as the custom topic
      setSelectedTopic({
        title: "choose your own",
        prompt: "",
        description: "",
      }); // Automatically select "choose your own"
    }

    // Focus on the textarea if "choose your own" is selected
    if (!topicExists || topic.title.toLowerCase() === "choose your own") {
      setTimeout(() => {
        topicTextareaRef.current && topicTextareaRef.current.focus();
      }, 0);
    }
  }

  // Function to handle custom topic input changes
  function handleInputTopic(e) {
    const newTopic = e.target.value;
    const capitalizedTopic = capitalizeFirstLetter(newTopic).substring(0, 150);
    setCustomTopic(capitalizedTopic);
  }

  // Function to proceed with the selected or custom topic
  function onContinueForward() {
    if (props.currentTopic) {
      // Current topic exists which means we are changing settings
      setDisplayWarning(true);
    } else {
      let continueWithTopic = selectedTopic;
      if (continueWithTopic.title.toLowerCase() === "choose your own") {
        continueWithTopic.title = customTopic;
        continueWithTopic.prompt = customTopic;
      }

      continueWithTopic.prompt = topicData.system.replace(
        "[TOPIC]",
        continueWithTopic.prompt
      );

      props.onContinueForward({ topic: continueWithTopic });
    }
  }

  function buildTopicPrompt(topic) {
    const prompt = topicData.system.replace("[TOPIC]", topic);
    return prompt;
  }

  function getTopicTitle() {
    const topic =
      selectedTopic.title.toLowerCase() === "choose your own"
        ? customTopic
        : selectedTopic.title;

    return topic;
  }

  // Conditional rendering for showing the Next button
  const shouldShowNextButton =
    selectedTopic &&
    selectedTopic.title &&
    !(
      selectedTopic.title.toLowerCase() === "choose your own" &&
      !customTopic.trim()
    );

  const container = {
    // height: "550px",
    // maxHeight: "100vh",
    width: "550px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flexStart",
    alignItems: "center",
  };

  const textBoxStyle = {
    backgroundColor: "transparent",
    width: "100%",
    color: "white",
    textAlign: "center",
    border: "0",
    fontFamily: "Tinos, serif",
    lineHeight: "1.2em",
    // fontSize: "25px",
    resize: "none",
    padding: "0",
    height: isMobile ? "60px" : "80px",
    display: showTextBox() ? "" : "none",
  };

  function showTextBox() {
    return selectedTopic.title === "choose your own"
      ? hoverTopic && hoverTopic?.title !== "choose your own"
        ? false
        : true
      : hoverTopic?.title === "choose your own"
      ? true
      : false;
  }

  const selectButtonStyle = {
    marginBottom: isMobile ? "3px" : "15px",
    padding: isMobile ? "3px 0" : "6px 0",
  };

  return (
    <>
      {displayWarning ? (
        <ResetWarning
          message="changing topic"
          onReset={() =>
            props.onReset({
              title: getTopicTitle(),
              prompt: buildTopicPrompt(getTopicTitle()),
            })
          }
          onCancel={props.onCancel}
        />
      ) : (
        <div style={container}>
          <h1 style={{ marginBottom: isMobile ? "0" : "20px" }}>THE ISSUE</h1>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              width: "100%",
            }}
          >
            {topics.map((topic, index) => (
              <button
                key={index}
                className={
                  selectedTopic.title === topic.title ? "selected " : ""
                }
                onClick={() => selectTopic(topic)}
                onMouseEnter={() => setHoverTopic(topic)}
                onMouseLeave={() => setHoverTopic(null)}
                style={selectButtonStyle}
              >
                {toTitleCase(topic.title)}
              </button>
            ))}
            <p
              style={{
                margin: "0",
                height: showTextBox() ? "0" : isMobile ? "60px" : "80px",
              }}
            >
              {hoverTopic
                ? hoverTopic.description
                : selectedTopic
                ? selectedTopic.description
                : "please select an issue for the discussion"}
            </p>
          </div>
          <textarea
            ref={topicTextareaRef}
            className="unfocused"
            rows="3"
            value={customTopic}
            placeholder="Write a topic here..."
            onChange={handleInputTopic}
            style={textBoxStyle}
          />
          <button
            onClick={onContinueForward}
            style={{
              marginBottom: "10px",
              visibility: shouldShowNextButton ? "" : "hidden",
            }}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}

export default SelectTopic;
