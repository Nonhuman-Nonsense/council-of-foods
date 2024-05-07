import React, { useState, useRef, useEffect } from "react";
import RotateDevice from '../RotateDevice';
import { capitalizeFirstLetter } from "../../utils";
import { useMediaQuery } from 'react-responsive'

function Welcome({ onContinueForward }) {

  const isPortrait = useMediaQuery({ query: '(orientation: portrait)' })

  const wrapper = {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  };

  const welcomeStyle = {
    display: "flex",
    flexDirection: "column",
    height: "80%",
    justifyContent: "space-between",
  };

  return (
    <div style={wrapper}>
      <div style={welcomeStyle}>
        <div>
          <h2>welcome to</h2>
          <h1>COUNCIL OF FOODS</h1>
        </div>
        {isPortrait ?
          <RotateDevice />
        :
        <HumanNameInput onContinueForward={onContinueForward} />
        }
      </div>
    </div>
  );
}

function HumanNameInput(props) {
  const [humanName, setHumanName] = useState("");
  const [isHumanNameMissing, setIsHumanNameMissing] = useState(false);
  const inputRef = useRef(null);


  const imageUrl = `/images/icons/send_message_filled.svg`;

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

  const inputStyle = {
    width: "300px",
    height: "22px",
    paddingRight: "30px"/* Make room for the arrow */
  };

  const imageStyle = {
    position: "absolute",
    right: "0",
    width: "23px",
    height: "23px",
    cursor: "pointer",
    marginRight: "6px",
    filter: "brightness(30%)",
  };

  return (
    <div>
      <h3>please type your name to enter:</h3>
      <div className="input-icon-wrapper">
        <input
          ref={inputRef}
          style={inputStyle}
          type="text"
          value={humanName}
          placeholder="your name"
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />
        <img
          src={imageUrl}
          style={imageStyle}
          onClick={continueForward}
        />
      </div>
      <h3 className={`${!isHumanNameMissing ? "hidden" : ""}`}>
        enter your name to proceed
      </h3>
    </div>
  );
}

export default Welcome;
