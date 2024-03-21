import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight } from "@fortawesome/free-solid-svg-icons";

function NameInput(props) {
  const [name, setName] = useState("");
  const [isNameMissing, setIsNameMissing] = useState(false);

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

  function enterCouncil() {
    if (name) {
      props.onEnterSetup();
    } else {
      console.log("No name...");
      setIsNameMissing(true);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      enterCouncil();
    }
  }

  return (
    <div>
      <h3 className="sub-sub-header">please type your name to enter:</h3>
      <div className="input-icon-wrapper">
        <input
          className="name-input"
          type="text"
          value={name}
          placeholder="your name"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <FontAwesomeIcon
          icon={faArrowRight}
          className="input-arrow"
          onClick={enterCouncil}
        />
      </div>
      <h3 className={`sub-sub-header ${!isNameMissing ? "hidden" : ""}`}>
        please enter your name to proceed
      </h3>
    </div>
  );
}

export default NameInput;
