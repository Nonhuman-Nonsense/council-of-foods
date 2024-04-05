import React, { useState, useRef, useEffect } from "react";
import { capitalizeFirstLetter } from "../utils";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";

function HumanNameInput(props) {
  const [humanName, setHumanName] = useState("");
  const [isHumanNameMissing, setIsHumanNameMissing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    // Focus on the input field when the component mounts
    inputRef.current.focus();
  }, []);

  function handleChange(e) {
    const inputValue = e.target.value;
    const trimmedValue = inputValue.trim();

    setHumanName(inputValue);

    if (!trimmedValue) {
      setIsHumanNameMissing(true);
    } else {
      setIsHumanNameMissing(false);
      const capitalizedHumanName = capitalizeFirstLetter(trimmedValue);
      setHumanName(capitalizedHumanName);
    }
  }

  function continueForward() {
    if (humanName) {
      props.onContinueForward({ humanName: humanName });
    } else {
      setIsHumanNameMissing(true);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent the default behavior of the Enter key

      continueForward();
    }
  }

  return (
    <div>
      <h3>please type your name to enter:</h3>
      <div className="input-icon-wrapper">
        <input
          ref={inputRef}
          className="text-input name-input"
          type="text"
          value={humanName}
          placeholder="your name"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <FontAwesomeIcon
          icon={faArrowRight}
          className="input-arrow"
          onClick={continueForward}
          style={{ cursor: "pointer" }}
        />
      </div>
      <h3 className={`${!isHumanNameMissing ? "hidden" : ""}`}>
        please enter your name to proceed
      </h3>
    </div>
  );
}

export default HumanNameInput;
