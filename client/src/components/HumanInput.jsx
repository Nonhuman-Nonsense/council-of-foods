import { useState, useEffect, useRef } from "react";
import SpeechRecognition, {
  useSpeechRecognition,
} from "react-speech-recognition";
import ConversationControlIcon from "./ConversationControlIcon";
import TextareaAutosize from 'react-textarea-autosize';
import { useMobile, dvh, mapFoodIndex } from "../utils";

function HumanInput({ foods, isPanelist, currentSpeakerName, onSubmitHumanMessage }) {
  const [isRecording, setIsRecording] = useState(false);
  const [canContinue, setCanContinue] = useState(false);
  const [previousTranscript, setPreviousTranscript] = useState("");
  const [askParticular, setAskParticular] = useState("");
  const [someoneHovered, setSomeoneHovered] = useState(false);
  const inputArea = useRef(null);
  const isMobile = useMobile();

  const maxInputLength = 350;

  // Accessing the speech recognition features from the custom hook
  const {
    transcript,
    // listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
    browserSupportsContinuousListening,
  } = useSpeechRecognition();

  // Effect to manage speech recognition state
  useEffect(() => {
    if (browserSupportsSpeechRecognition) {
      if (isRecording) {
        setPreviousTranscript(inputArea.current.value);
        resetTranscript();
        if (browserSupportsContinuousListening) {
          SpeechRecognition.startListening({ continuous: true });
        } else {
          SpeechRecognition.startListening();
        }
      } else {
        SpeechRecognition.stopListening();
      }
    }
  }, [isRecording]);

  function handleStartStopRecording() {
    setIsRecording(!isRecording); // Toggle the recording state
  }

  useEffect(() => {
    inputArea.current.value = (previousTranscript ? previousTranscript + " " + transcript : transcript);
    inputChanged();
  }, [transcript]);

  function inputFocused(e) {
    setIsRecording(false);
  }

  function inputChanged(e) {
    if (inputArea.current.value.length > 0 && inputArea.current.value.trim().length !== 0) {
      setCanContinue(true);
    } else {
      setCanContinue(false);
    }
  }

  function checkEnter(e) {
    if (canContinue && !e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      submitAndContinue();
    }
  }

  function submitAndContinue() {
    setIsRecording(false);
    onSubmitHumanMessage(inputArea.current.value.substring(0, maxInputLength), askParticular);
  }

  const wrapperStyle = {
    position: "absolute",
    bottom: "0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };

  const micStyle = {
    position: "absolute",
    bottom: "-2" + dvh,
    height: "45" + dvh,
    minHeight: "135px",
    zIndex: "0",
    animation: "4s micAppearing",
    animationFillMode: "both",
  };

  const divStyle = {
    width: isMobile ? "45px" : "56px",
    height: isMobile ? "45px" : "56px",
    zIndex: "3"
  };

  const textStyle = {
    backgroundColor: "transparent",
    width: "70vw",
    color: "white",
    textAlign: "center",
    border: "0",
    fontFamily: "Arial, sans-serif",
    fontSize: isMobile ? "18px" : "25px",
    margin: isMobile && "0",
    marginBottom: isMobile && "-8px",
    lineHeight: "1.1em",
    resize: "none",
    padding: "0",
  };

  // This is same calculation as in the FoodItem
  const overViewFoodItemStyle = (index, total) => {
    const left = (index / (total - 1)) * 100;

    const topMax = 3.0; // The curvature
    const topOffset = 14.5; // Vertical offset to adjust the curve's baseline

    let middleIndex;
    let isEven = total % 2 === 0;
    if (isEven) {
      middleIndex = total / 2 - 1;
    } else {
      middleIndex = (total - 1) / 2;
    }

    let a;
    if (isEven) {
      a = topMax / Math.pow(middleIndex + 0.5, 2);
    } else {
      a = topMax / Math.pow(middleIndex, 2);
    }

    let top;
    if (isEven) {
      const distanceFromMiddle = Math.abs(index - middleIndex - 0.5);
      top = a * Math.pow(distanceFromMiddle, 2) + topMax - topOffset;
    } else {
      top = a * Math.pow(index - middleIndex, 2) + topMax - topOffset;
    }

    return {
      position: "absolute",
      left: `${left}%`,
      top: `${top}vw`,
      width: `14vw`,
      height: `14vw`,
      borderRadius: "14vw",
      transform: "translate(-50%, -50%)",
      opacity: "1",
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-end",
      transition: "border 0.2s, background-color 0.2s"
    };
  };

  const ringStyle = {
    position: "absolute",
    top: "62%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: foods.length > 6 ? "79%" : "70%",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
  };

  const deselectorStyle = {
    position: "absolute",
    top: "15" + dvh,
    height: "60" + dvh,
    width: "100vw",
    pointerEvents: "auto",
    zIndex: "-1"
  };

  const selectTooltip = {
    fontSize: "20px",
    opacity: someoneHovered ? "0.9" : "0",
    transition: "opacity 0.2s",
    padding: "12px",
    backdropFilter: "blur(3px)",
    backgroundColor: "rgba(0, 0, 0, 0.1)",
    borderRadius: "28px",
  };

  return (<>
    {!isPanelist && (<>
      <div style={{ ...ringStyle, zIndex: "-1" }}>
        <div style={{ position: "absolute", bottom: "21vw" }}>
          <div style={selectTooltip}>Select a food to ask them directly</div>
        </div>
        {foods.map((food, index) => (
          <div style={{ ...overViewFoodItemStyle(mapFoodIndex(foods.length, index), foods.length), backgroundColor: askParticular === food.name ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0)" }} key={index}></div>
        ))}
      </div>
      <div style={{ ...ringStyle, zIndex: "0" }}>
        {foods.map((food, index) => (
          <div
            style={{ ...overViewFoodItemStyle(mapFoodIndex(foods.length, index), foods.length), border: askParticular === food.name && "3px solid rgba(255,255,255,0.8)", pointerEvents: "auto" }}
            className="ringHover"
            key={index}
            onClick={() => setAskParticular(food.name)}
            onMouseEnter={() => setSomeoneHovered(true)}
            onMouseLeave={() => setSomeoneHovered(false)}
          ></div>
        ))}
      </div>
      <div style={deselectorStyle} onClick={() => setAskParticular("")}></div>
    </>)}
    <div style={wrapperStyle}>
      <img alt="Say something!" src="/mic.png" style={micStyle} />
      <div style={{ zIndex: "4", position: "relative", pointerEvents: "auto" }}>
        <TextareaAutosize
          ref={inputArea}
          style={textStyle}
          onChange={inputChanged}
          onKeyDown={checkEnter}
          onFocus={inputFocused}
          className="unfocused"
          minRows="1"
          maxRows="6"
          maxLength={maxInputLength}
          placeholder={isPanelist? `What does ${currentSpeakerName} have to say about this?` : browserSupportsSpeechRecognition ? "Type your question or start recording..." : "Type your question..."}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "row", pointerEvents: "auto", justifyContent: "center" }}>
        <div style={divStyle} />
        {browserSupportsSpeechRecognition &&
          <div style={divStyle}>
            <ConversationControlIcon
              icon={(isRecording ? "record_voice_on" : "record_voice_off")}
              onClick={handleStartStopRecording}
              tooltip={"Mute"}
            />
          </div>
        }
        <div style={divStyle}>
          {canContinue &&
            <ConversationControlIcon
              icon={"send_message"}
              tooltip={"Mute"}
              onClick={submitAndContinue}
            />
          }
        </div>
        {!browserSupportsSpeechRecognition && <div style={divStyle} />}
      </div>
    </div>
  </>
  );
}

export default HumanInput;
