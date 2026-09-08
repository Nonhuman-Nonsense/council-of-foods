import { useState, useRef, useEffect } from "react";
import ResetWarning from "@main/overlay/ResetWarning";
import { capitalizeFirstLetter, toTitleCase, useMobile, useMobileXs } from "@/utils";
import { useTranslation } from "react-i18next";
import type { Topic } from "@shared/ModelTypes";
import { useCouncilSettings } from "@/settings/councilSettings";
import { useMeetingSetupStore } from "@newMeeting/meetingSetupStore";

import { getTopicsBundle } from "@main/topicsBundle";
import { buildTopicFromSelection } from "./meetingSetup";

/**
 * SelectTopic Component
 *
 * This component allows the Chair to select the topic for discussion.
 * It presents a list of predefined topics from the configuration file and an
 * option to enter a custom topic.
 *
 * Core Logic:
 * - Displays a grid of topics. If < 6 topics, it uses a single column; otherwise two columns.
 * - Handles "Custom Topic" selection, revealing a text area for manual input.
 * - Validates that a topic is selected (and custom text entered if applicable) before proceeding.
 * - Shows a warning if the user attempts to change the topic mid-meeting.
 */

interface SelectTopicProps {
  onContinueForward: (selectedTopic: Topic) => void;
  onPreviewTopic?: (topicId: string, topicTitle: string) => void;
  onCommitTopic?: (selectedTopic: Topic) => void;
  /**
   * Every keystroke in the custom topic box, carrying the text as it now
   * stands — the reaction is debounced downstream, so this stays raw.
   */
  onCustomTopicTyped?: (text: string) => void;
  currentTopic?: Topic;
  onReset?: (resetTopic: Topic) => void;
  onCancel?: () => void;
}

function SelectTopic({
  onContinueForward,
  onPreviewTopic,
  onCommitTopic,
  onCustomTopicTyped,
  currentTopic,
  onReset,
  onCancel,
}: SelectTopicProps): React.ReactElement {
  const {
    selectedTopic, setSelectedTopic,
    customTopic, setCustomTopic,
  } = useMeetingSetupStore();
  const { t, i18n } = useTranslation();
  const { capabilities } = useCouncilSettings();
  const isMobile = useMobile();
  const isMobileXs = useMobileXs();
  const topicTextareaRef = useRef<HTMLTextAreaElement>(null);

  const topicsBundle = getTopicsBundle(i18n.language);

  /* -------------------------------------------------------------------------- */
  /*                                    State                                   */
  /* -------------------------------------------------------------------------- */

  const [displayWarning, setDisplayWarning] = useState<boolean>(false);
  const [hoveredTopic, setHoveredTopic] = useState<string | null>(null);

  /* -------------------------------------------------------------------------- */
  /*                                   Effects                                  */
  /* -------------------------------------------------------------------------- */

  // Pre-fill when editing the meeting topic (#settings)
  useEffect(() => {
    const id = currentTopic?.id;
    if (!id) return;

    if (id === topicsBundle.custom_topic.id && currentTopic.description) {
      setCustomTopic(currentTopic.description);
    } else if (id !== topicsBundle.custom_topic.id) {
      setCustomTopic("");
    }
    setSelectedTopic(id);
  }, [currentTopic?.id, currentTopic?.description]);

  /* -------------------------------------------------------------------------- */
  /*                                  Handlers                                  */
  /* -------------------------------------------------------------------------- */

  function handleInputTopic(e: React.ChangeEvent<HTMLTextAreaElement>): void {
    const newTopic = e.target.value;
    const capitalizedTopic = capitalizeFirstLetter(newTopic).substring(0, 150);
    setCustomTopic(capitalizedTopic);
    // The processed value, not the raw keystroke: what's on screen is what
    // the agent should be told about.
    onCustomTopicTyped?.(capitalizedTopic);
  }

  function proceedForward(): void {
    if (currentTopic) {
      setDisplayWarning(true);
    } else {
      const builtTopic = buildTopicFromSelection({
        topicsBundle,
        selectedTopicId: selectedTopic,
        customTopic,
      });
      onCommitTopic?.(builtTopic);
      onContinueForward(builtTopic);
    }
  }

  /* -------------------------------------------------------------------------- */
  /*                                   Helpers                                  */
  /* -------------------------------------------------------------------------- */

  /**
   * Determines which tooltip text to display.
   * Priority: Hovered Topic -> Selected Topic -> Default Instruction
   */
  function toolTip(): string | undefined {
    if (hoveredTopic) {
      return topicsBundle.topics.find((t: Topic) => t.id === hoveredTopic)?.description;
    } else if (selectedTopic) {
      return topicsBundle.topics.find((t: Topic) => t.id === selectedTopic)?.description;
    } else {
      return t("meeting.selectIssue");
    }
  }

  /**
   * Determines if the custom topic text box should be visible.
   * Logic: Visible if Custom is selected OR hovered (unless hovering another topic while Custom is selected).
   */
  function showTextBox(): boolean {
    if (selectedTopic === topicsBundle.custom_topic.id && hoveredTopic && hoveredTopic !== topicsBundle.custom_topic.id) {
      return false;
    }
    return selectedTopic === topicsBundle.custom_topic.id || hoveredTopic === topicsBundle.custom_topic.id;
  }

  const shouldShowNextButton =
    selectedTopic &&
    !(selectedTopic === topicsBundle.custom_topic.id && !customTopic.trim());

  /* -------------------------------------------------------------------------- */
  /*                                    Styles                                  */
  /* -------------------------------------------------------------------------- */

  const standardTopics = topicsBundle.topics;
  const isSingleColumn = standardTopics.length <= 6;


  const detailSlotHeight = isMobile ? (isMobileXs ? "36px" : "40px") : "55px";

  const containerStyle: React.CSSProperties = {
    width: "96vw",
    maxWidth: "850px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    alignItems: "center",
    marginBottom: isMobile ? (isMobileXs ? "9px" : "20px") : "40px",
  };

  const gridContainerStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: isSingleColumn ? "1fr" : "1fr 1fr",
    width: "100%",
    columnGap: "14px",
    rowGap: isMobile ? "3px" : "15px",
    justifyItems: "center"
  };

  const selectButtonStyle: React.CSSProperties = {
    padding: isMobile ? "3px 0" : "6px 0",
    width: isSingleColumn ? "50%" : "100%",
  };

  const customButtonStyle: React.CSSProperties = {
    ...selectButtonStyle,
    gridColumn: "1 / -1", // Always span full row for centering
    width: "50%",         // Always 50% width for consistency
  };

  const descriptionStyle: React.CSSProperties = {
    marginTop: isMobile ? "9px" : "15px",
    marginBottom: 0,
    width: isMobile ? "80%" : "70%",
    height: showTextBox() ? "0" : detailSlotHeight,
    overflow: "hidden"
  };

  const textBoxStyle: React.CSSProperties = {
    backgroundColor: "transparent",
    width: isMobile ? "80%" : "70%",
    color: "white",
    textAlign: "center",
    border: "0",
    fontFamily: "Tinos, serif",
    lineHeight: "1.2em",
    resize: "none",
    padding: "0",
    margin: "0",
    height: detailSlotHeight,
    overflowY: "auto",
    display: showTextBox() ? "" : "none",
  };

  /* -------------------------------------------------------------------------- */
  /*                                   Render                                   */
  /* -------------------------------------------------------------------------- */

  return (
    <>
      {displayWarning ? (
        <ResetWarning
          message={t('reset.changeTopic')}
          onReset={() =>
            onReset?.(
              buildTopicFromSelection({
                topicsBundle,
                selectedTopicId: selectedTopic,
                customTopic,
              })
            )
          }
          onCancel={() => onCancel?.()}
        />
      ) : (
        <div style={containerStyle}>
          <h1 style={{ marginBottom: isMobile ? (isMobileXs ? "0px" : "5px") : undefined }}>
            {t('meeting.issueHeading')}
          </h1>

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
            <div style={gridContainerStyle}>
              {standardTopics.map((topic: Topic) => (
                <button
                  key={topic.id}
                  data-testid="topic-button"
                  className={selectedTopic === topic.id ? "selected " : ""}
                  onClick={() => {
                    setSelectedTopic(topic.id);
                    onPreviewTopic?.(topic.id, topic.title);
                  }}
                  onMouseEnter={() => setHoveredTopic(topic.id)}
                  onMouseLeave={() => setHoveredTopic(null)}
                  style={selectButtonStyle}
                >
                  {toTitleCase(topic.title)}
                </button>
              ))}

              {/* Custom Topic Button */}
              {topicsBundle.custom_topic && (
                <button
                  className={selectedTopic === topicsBundle.custom_topic.id ? "selected " : ""}
                  onClick={() => {
                    setSelectedTopic(topicsBundle.custom_topic.id);
                    onPreviewTopic?.(topicsBundle.custom_topic.id, topicsBundle.custom_topic.title);
                    setTimeout(() => {
                      topicTextareaRef.current?.focus();
                    }, 0);
                  }}
                  onMouseEnter={() => setHoveredTopic(topicsBundle.custom_topic.id)}
                  onMouseLeave={() => setHoveredTopic(null)}
                  style={customButtonStyle}
                >
                  {toTitleCase(topicsBundle.custom_topic.title)}
                </button>
              )}
            </div>

            {/* Description Tooltip */}
            <p style={descriptionStyle}>
              {toolTip()}
            </p>
          </div>

          {/* Custom Topic Input */}
          <textarea
            ref={topicTextareaRef}
            className="unfocused topic-textarea"
            rows={2}
            value={customTopic}
            placeholder={t('meeting.customTopicPlaceholder')}
            onChange={handleInputTopic}
            style={textBoxStyle}
          />

          {capabilities.browserUi ? (
            <button
              onClick={proceedForward}
              style={{ visibility: shouldShowNextButton ? undefined : "hidden" }}
            >
              {t('app.next')}
            </button>
          ) : null}
        </div>
      )}
    </>
  );
}

export default SelectTopic;
