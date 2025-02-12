import React, { useState, useRef, useEffect } from "react";
import { capitalizeFirstLetter } from "../../utils";

function Name({onContinueForward}) {

  const wrapper = {
    maxWidth: "500px",
    display:"flex",
    flexDirection: "column"
  };

  return (
      <div style={wrapper}>
        <h1>SAY SOMETHING</h1>
        <div>
          <p>Do you want to adress the Council of Foods?</p>
          <p>Please enter your name to raise a request to speak,<br/> and then wait until you are given the floor by Water, the moderator.</p>
        </div>
        <HumanNameInput onContinueForward={onContinueForward} />
      </div>
  );
}

function HumanNameInput(props) {
  const [humanName, setHumanName] = useState("");
  const [isHumanNameMissing, setIsHumanNameMissing] = useState(false);
  const inputRef = useRef(null);


  const imageUrl = `/icons/send_message_filled.svg`;

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

  const inputIconWrapper = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center"
  };

  return (
    <div>
      <h3>please type your name:</h3>
      <div style={inputIconWrapper}>
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
          alt="continue"
          style={imageStyle}
          onClick={continueForward}
        />
      </div>
      <h3 style={{visibility: !isHumanNameMissing ? "hidden" : ""}}>
        enter your name to proceed
      </h3>
    </div>
  );
}

export default Name;
