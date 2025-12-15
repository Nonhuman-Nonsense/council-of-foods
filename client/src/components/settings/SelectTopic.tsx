import { useState, useRef, useEffect, ChangeEvent } from "react";
import ResetWarning from "../overlays/ResetWarning";
import { capitalizeFirstLetter, toTitleCase, useMobile, useMobileXs } from "../../utils";
import { useTranslation } from "react-i18next";

export interface Topic {
    id: string;
    title: string;
    description?: string;
    prompt?: string;
}

interface SelectTopicProps {
    topics: Topic[];
    onContinueForward: (data: { topic: string; custom: string }) => void;
    currentTopic?: Topic;
    onReset?: (data: { topic: string; custom: string }) => void;
    onCancel?: () => void;
}

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
function SelectTopic({
    topics,
    onContinueForward,
    currentTopic,
    onReset,
    onCancel
}: SelectTopicProps): JSX.Element {
    const { t } = useTranslation();
    const isMobile = useMobile();
    const isMobileXs = useMobileXs();
    const topicTextareaRef = useRef<HTMLTextAreaElement>(null);

    /* -------------------------------------------------------------------------- */
    /*                                    State                                   */
    /* -------------------------------------------------------------------------- */

    const [selectedTopic, setSelectedTopic] = useState<string>("");
    const [hoverTopic, setHoverTopic] = useState<string | null>(null);
    const [customTopic, setCustomTopic] = useState<string>("");
    const [displayWarning, setDisplayWarning] = useState<boolean>(false);

    /* -------------------------------------------------------------------------- */
    /*                                   Effects                                  */
    /* -------------------------------------------------------------------------- */

    // Pre-fill selection if editing an existing topic (e.g. backtracking)
    useEffect(() => {
        if (currentTopic?.prompt) {
            if (currentTopic.id === 'customtopic' && currentTopic.description) {
                setCustomTopic(currentTopic.description);
            }
            setSelectedTopic(currentTopic.id);
        }
    }, [currentTopic]);

    /* -------------------------------------------------------------------------- */
    /*                                  Handlers                                  */
    /* -------------------------------------------------------------------------- */

    function handleInputTopic(e: ChangeEvent<HTMLTextAreaElement>) {
        const newTopic = e.target.value;
        const capitalizedTopic = capitalizeFirstLetter(newTopic).substring(0, 150);
        setCustomTopic(capitalizedTopic);
    }

    function proceedForward() {
        if (currentTopic) {
            setDisplayWarning(true);
        } else {
            onContinueForward({ topic: selectedTopic, custom: customTopic });
        }
    }

    /* -------------------------------------------------------------------------- */
    /*                                   Helpers                                  */
    /* -------------------------------------------------------------------------- */

    /**
     * Determines which tooltip text to display.
     * Priority: Hovered Topic -> Selected Topic -> Default Instruction
     */
    function toolTip() {
        if (hoverTopic) {
            return topics.find(t => t.id === hoverTopic)?.description;
        } else if (selectedTopic) {
            return topics.find(t => t.id === selectedTopic)?.description;
        } else {
            return t("selectissue");
        }
    }

    /**
     * Determines if the custom topic text box should be visible.
     * Logic: Visible if Custom is selected OR hovered (unless hovering another topic while Custom is selected).
     */
    function showTextBox() {
        if (selectedTopic === 'customtopic' && hoverTopic && hoverTopic !== 'customtopic') {
            return false;
        }
        return selectedTopic === 'customtopic' || hoverTopic === 'customtopic';
    }

    const shouldShowNextButton =
        selectedTopic &&
        !(selectedTopic === "customtopic" && !customTopic.trim());

    /* -------------------------------------------------------------------------- */
    /*                                    Styles                                  */
    /* -------------------------------------------------------------------------- */

    const standardTopics = topics.filter(t => t.id !== 'customtopic');
    const customTopicObj = topics.find(t => t.id === 'customtopic');
    const isSingleColumn = standardTopics.length <= 6;

    const containerStyle: any = {
        width: "96vw",
        maxWidth: "850px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flexStart",
        alignItems: "center",
    };

    const gridContainerStyle: any = {
        display: "grid",
        gridTemplateColumns: isSingleColumn ? "1fr" : "1fr 1fr",
        width: "100%",
        columnGap: "14px",
        rowGap: isMobile ? "3px" : "15px",
        justifyItems: "center"
    };

    const selectButtonStyle: any = {
        padding: isMobile ? "3px 0" : "6px 0",
        width: isSingleColumn ? "50%" : "100%",
    };

    const customButtonStyle: any = {
        ...selectButtonStyle,
        gridColumn: "1 / -1", // Always span full row for centering
        width: "50%",         // Always 50% width for consistency
    };

    const descriptionStyle: any = {
        marginTop: isMobile ? "9px" : "15px",
        marginBottom: 0,
        width: isMobile ? "80%" : "70%",
        height: showTextBox() ? "0" : isMobile ? (isMobileXs ? "45px" : "60px") : "80px",
        overflow: "hidden"
    };

    const textBoxStyle: any = {
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
        height: isMobile ? (isMobileXs ? "45px" : "60px") : "80px",
        display: showTextBox() ? "" : "none",
    };

    /* -------------------------------------------------------------------------- */
    /*                                   Render                                   */
    /* -------------------------------------------------------------------------- */

    return (
        <>
            {displayWarning && onReset ? (
                <ResetWarning
                    message={t('reset.changeTopic')}
                    onReset={() => onReset({ topic: selectedTopic, custom: customTopic })}
                    onCancel={() => { if (onCancel) onCancel(); }}
                />
            ) : (
                <div style={containerStyle}>
                    <h1 style={{ marginBottom: isMobile ? (isMobileXs ? "0px" : "5px") : undefined }}>
                        {t('theissue')}
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

                            {/* Custom Topic Button */}
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
                                    style={customButtonStyle}
                                >
                                    {toTitleCase(customTopicObj.title)}
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
                        rows={3}
                        value={customTopic}
                        placeholder={t('writetopic')}
                        onChange={handleInputTopic}
                        style={textBoxStyle}
                    />

                    <button
                        onClick={proceedForward}
                        style={{ visibility: shouldShowNextButton ? "visible" : "hidden" }}
                    >
                        {t('next')}
                    </button>
                </div>
            )}
        </>
    );
}

export default SelectTopic;
