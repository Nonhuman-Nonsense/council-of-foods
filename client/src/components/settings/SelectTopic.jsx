import { useState, useRef, useEffect } from "react";
import ResetWarning from "../overlays/ResetWarning";
import { capitalizeFirstLetter, toTitleCase, useMobile, useMobileXs } from "../../utils";
import { useTranslation } from "react-i18next";


export default SelectTopic;

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
  useEffect(() => {
    if (currentTopic?.prompt) {
      // If we are editing, we might need to pre-fill custom topic
      if (currentTopic.id === 'customtopic' && currentTopic.description) {
        setCustomTopic(currentTopic.description);
      }
      setSelectedTopic(currentTopic.id);
    }
  }, [currentTopic]);

  function proceedForward() {
    if (currentTopic) {
      setDisplayWarning(true);
    } else {
      onContinueForward({ topic: selectedTopic, custom: customTopic });
    }
  }

  function handleInputTopic(e) {
    const newTopic = e.target.value;
    const capitalizedTopic = capitalizeFirstLetter(newTopic).substring(0, 150);
    setCustomTopic(capitalizedTopic);
  }

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



  function showTextBox() {
    // If we are hovering another topic, hide the text box to show that topic's description
    if (selectedTopic === 'customtopic' && hoverTopic && hoverTopic !== 'customtopic') {
      return false;
    }
    return selectedTopic === 'customtopic' || hoverTopic === 'customtopic';
  }



  function toolTip() {
    if (hoverTopic) {
      return topics.find(t => t.id === hoverTopic)?.description;
    } else if (selectedTopic) {
      return topics.find(t => t.id === selectedTopic)?.description;
    } else {
      return t("selectissue")
    }
  }

  const standardTopics = topics.filter(t => t.id !== 'customtopic');
  const customTopicObj = topics.find(t => t.id === 'customtopic');

  const isSingleColumn = standardTopics.length <= 6;

  const gridContainer = {
    display: "grid",
    gridTemplateColumns: isSingleColumn ? "1fr" : "1fr 1fr",
    width: "100%",
    columnGap: "14px",
    rowGap: isMobile ? "3px" : "15px",
    justifyItems: "center"
  };

  const selectButtonStyle = {
    padding: isMobile ? "3px 0" : "6px 0",
    width: isSingleColumn ? "50%" : "100%", // Constrain width in single column
  };

  // Custom Topic specific style: Span all columns, 50% width to match centered appearance
  const customButtonStyle = {
    ...selectButtonStyle,
    gridColumn: "1 / -1", // Span full row in both 1-col and 2-col modes
    width: "50%", // Always 50% width to be centered and consistent
    // User said "spacing below custom topic button looks tight". Grid uses rowGap.
    // If we want equal distance, rowGap creates it.
    // But user asked for "distance between text and next button". That's outside the grid.
  };

  const textareaFontSize = isMobile ? "16px" : "inherit"; // Match paragraph font size roughly?
  // User said "text inside textarea... doesn't scale... make sure font size uses same as toolTip"
  // toolTip is inside a <p>. <p> usually has inherited font size.
  // Textarea often has user-agent default (e.g. 11px or 13px monospace).
  // We should force it to inherit or use specific size.

  const textBoxStyle = {
    backgroundColor: "transparent",
    width: isMobile ? "80%" : "70%",
    color: "white",
    textAlign: "center",
    border: "0",
    fontFamily: "Tinos, serif",
    lineHeight: "1.2em",
    fontSize: "inherit", // Force inherit from parent (container) to match <p> sibling
    resize: "none",
    padding: "0",
    margin: "0",
    height: isMobile ? (isMobileXs ? "45px" : "60px") : "80px",
    display: showTextBox() ? "" : "none",
  };

  return (
    <>
      {displayWarning ? (
        <ResetWarning
          message={t('reset.changeTopic')}
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
            {/* Grid Layout for Topics */}
            <div style={gridContainer}>
              {standardTopics.map((topic) => (
                <button
                  key={topic.id}
                  data-testid="topic-button"
                  className={selectedTopic === topic.id ? "selected " : ""}
                  onClick={() => setSelectedTopic(topic.id)}
                  onMouseEnter={() => setHoverTopic(topic.id)}
                  onMouseLeave={() => setHoverTopic(null)}
                  style={selectButtonStyle}
                >
                  {toTitleCase(topic.title)}
                </button>
              ))}

              {/* Custom Topic Button (Integrated into Grid) */}
              {customTopicObj && (
                <button
                  className={selectedTopic === customTopicObj.id ? "selected " : ""}
                  onClick={() => {
                    setSelectedTopic("customtopic");
                    setTimeout(() => {
                      topicTextareaRef.current && topicTextareaRef.current.focus();
                    }, 0);
                  }}
                  onMouseEnter={() => setHoverTopic("customtopic")}
                  onMouseLeave={() => setHoverTopic(null)}
                  style={customButtonStyle} // Use specific style
                >
                  {toTitleCase(customTopicObj.title)}
                </button>
              )}
            </div>

            <p
              style={{
                marginTop: "15px",
                marginBottom: 0,
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
              visibility: shouldShowNextButton ? "" : "hidden",
            }}
          >{t('next')}</button>
        </div>
      )}
    </>
  );
}
