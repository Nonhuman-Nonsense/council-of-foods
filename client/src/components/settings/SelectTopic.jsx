import { useState, useRef, useEffect } from "react";
import ResetWarning from "../overlays/ResetWarning";
import { capitalizeFirstLetter, toTitleCase, useMobile, useMobileXs } from "../../utils";
import { useTranslation } from "react-i18next";

function SelectTopic({
  topics,
  onContinueForward,
  currentTopic,
  onReset,
  onCancel
}) {
  const [selectedTopic, setSelectedTopic] = useState("");
  const [hoverTopic, setHoverTopic] = useState(null);
  const [customTopic, setCustomTopic] = useState("");
  const [displayWarning, setDisplayWarning] = useState(false);

  const topicTextareaRef = useRef(null);
  const isMobile = useMobile();
  const isMobileXs = useMobileXs();

  const { t } = useTranslation();

  // useEffect hook to listen for changes in currentTopic
  // If changing the topic in an ongoing meeting
  useEffect(() => {
    if (currentTopic?.prompt) {
      let reSelectTopic = topics.find((t) => t.id === currentTopic.id);
      if (currentTopic?.id === 'customtopic') {
        setCustomTopic(currentTopic.description);
      }
      setSelectedTopic(reSelectTopic.id);
    }
  }, [currentTopic]); // Dependency array includes only currentTopic

  // Function to proceed with the selected or custom topic
  function proceedForward() {
    if (currentTopic) {
      // Current topic exists which means we are changing settings
      setDisplayWarning(true);
    } else {
      onContinueForward({ topic: selectedTopic, custom: customTopic });
    }
  }

  // Function to handle custom topic input changes
  function handleInputTopic(e) {
    const newTopic = e.target.value;
    const capitalizedTopic = capitalizeFirstLetter(newTopic).substring(0, 150);
    setCustomTopic(capitalizedTopic);
  }

  // Conditional rendering for showing the Next button
  const shouldShowNextButton =
    selectedTopic &&
    !(
      selectedTopic === "customtopic" &&
      !customTopic.trim()
    );

  const container = {
    width: "96vw",
    maxWidth: "850px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flexStart",
    alignItems: "center",
  };

  const doubleColumn = {
    width: "50%",
    display: "flex",
    flexDirection: "column",
    margin: "0 7px"
  };

  const textBoxStyle = {
    backgroundColor: "transparent",
    width: isMobile ? "80%" : "70%",
    color: "white",
    textAlign: "center",
    border: "0",
    fontFamily: "Tinos, serif",
    lineHeight: "1.2em",
    // fontSize: "25px",
    resize: "none",
    padding: "0",
    margin: "0",
    height: isMobile ? (isMobileXs ? "45px" : "60px") : "80px",
    display: showTextBox() ? "" : "none",
  };

  function showTextBox() {
    if (selectedTopic === 'customtopic' && hoverTopic !== null && hoverTopic !== 'customtopic') {
      return false;
    } else if (selectedTopic === 'customtopic') {
      return true;
    } else if (hoverTopic === "customtopic") {
      return true;
    } else {
      return false;
    }
  }

  const selectButtonStyle = {
    marginBottom: isMobile ? "3px" : "15px",
    padding: isMobile ? "3px 0" : "6px 0",
  };

  function toolTip() {
    if (hoverTopic) {
      return topics.find(t => t.id === hoverTopic)?.description;
    } else if (selectedTopic) {
      return topics.find(t => t.id === selectedTopic)?.description;
    } else {
      return t("selectissue")
    }
  }

  return (
    <>
      {displayWarning ? (
        <ResetWarning
          message="changing topic"
          onReset={() =>
            onReset({ topic: selectedTopic, custom: customTopic })
          }
          onCancel={onCancel}
        />
      ) : (
        <div style={container}>
          <h1 style={{ marginBottom: isMobile && (isMobileXs ? "0px" : "5px") }}>{t('theissue')}</h1>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              alignItems: "center",
              width: "100%",
            }}
          >
            <div style={{ display: "flex", flexDirection: "row", width: "100%", justifyContent: "center" }}>
              <div style={doubleColumn}>
                {topics.filter((item, index) => {
                  if (index === topics.length - 1) return false;
                  if (topics.length <= 5 + 1) return true;
                  return index < (topics.length - 1) / 2;
                }).map((topic, index) => (
                  <button
                    key={index}
                    className={selectedTopic === topic.id ? "selected " : ""}
                    onClick={() => setSelectedTopic(topic.id)}
                    onMouseEnter={() => setHoverTopic(topic.id)}
                    onMouseLeave={() => setHoverTopic(null)}
                    style={selectButtonStyle}
                  >
                    {toTitleCase(topic.title)}
                  </button>
                ))}
              </div>
              <div style={{ ...doubleColumn, display: topics.length > 5 + 1 ? "flex" : "none" }}>
                {topics.filter((item, index) => {
                  if (index === topics.length - 1) return false;
                  if (topics.length <= 5 + 1) return false;
                  return (index >= (topics.length - 1) / 2);
                }).map((topic, index) => (
                  <button
                    key={index}
                    className={selectedTopic === topic.id ? "selected " : ""}
                    onClick={() => setSelectedTopic(topic.id)}
                    onMouseEnter={() => setHoverTopic(topic.id)}
                    onMouseLeave={() => setHoverTopic(null)}
                    style={selectButtonStyle}
                  >
                    {toTitleCase(topic.title)}
                  </button>
                ))}
              </div>
            </div>
            {topics.slice(-1).map((topic, index) => (
              <button
                key={index}
                className={selectedTopic === topic.id ? "selected " : ""}
                onClick={() => {
                  setSelectedTopic("customtopic");
                  //Todo, not sure why this is on timeout?
                  setTimeout(() => {
                    topicTextareaRef.current && topicTextareaRef.current.focus();
                  }, 0);
                }}
                onMouseEnter={() => setHoverTopic("customtopic")}
                onMouseLeave={() => setHoverTopic(null)}
                style={{ ...selectButtonStyle, width: "50%" }}
              >
                {toTitleCase(topic.title)}
              </button>
            ))}
            <p
              style={{
                margin: "0",
                width: isMobile ? "80%" : "70%",
                height: showTextBox() ? "0" : isMobile ? (isMobileXs ? "45px" : "60px") : "80px",
                overflow: "hidden"
              }}
            >{toolTip()}
            </p>
          </div>
          <textarea
            ref={topicTextareaRef}
            className="unfocused"
            rows="3"
            value={customTopic}
            placeholder={t('writetopic')}
            onChange={handleInputTopic}
            style={textBoxStyle}
          />
          <button
            onClick={proceedForward}
            style={{
              marginBottom: "10px",
              visibility: shouldShowNextButton ? "" : "hidden",
            }}
          >{t('next')}</button>
        </div>
      )}
    </>
  );
}

export default SelectTopic;
