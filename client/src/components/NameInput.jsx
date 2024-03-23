import React, { useState, useRef, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";

function NameInput(props) {
  const [name, setName] = useState("");
  const [isNameMissing, setIsNameMissing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    // Focus on the input field when the component mounts
    inputRef.current.focus();
  }, []);

  function handleChange(e) {
    const inputValue = e.target.value;
    // Immediately transform the first character to uppercase if it's a letter
    const updatedValue =
      inputValue.length === 1
        ? inputValue.toUpperCase()
        : inputValue.charAt(0) + inputValue.slice(1);

    setName(updatedValue);
    if (updatedValue) {
      setIsNameMissing(false);
    }
  }

  function enterSetup() {
    if (name) {
      props.onEnterSetup(name);
    } else {
      console.log("No name...");
      setIsNameMissing(true);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent the default behavior of the Enter key

      enterSetup();
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
          value={name}
          placeholder="your name"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <FontAwesomeIcon
          icon={faArrowRight}
          className="input-arrow"
          onClick={enterSetup}
          style={{ cursor: "pointer" }}
        />
      </div>
      <h3 className={`${!isNameMissing ? "hidden" : ""}`}>
        please enter your name to proceed
      </h3>
    </div>
  );
}

export default NameInput;
