import React, { useState, useRef, useEffect } from "react";
import { capitalizeFirstLetter, useMobile } from "../../utils";

function Name({ participants, onContinueForward }) {

  const wrapper = {
    maxWidth: "500px",
    display: "flex",
    flexDirection: "column"
  };

  return (
    <div style={wrapper}>
      <h1>SAY SOMETHING</h1>
      <div>
        <p>Do you want to adress the Council of Foods?</p>
        <p>Please enter your name to raise a request to speak,<br /> and then wait until you are given the floor by Water, the moderator.</p>
      </div>
      <HumanNameInput participants={participants} onContinueForward={onContinueForward} />
    </div>
  );
}

function HumanNameInput({ participants, onContinueForward }) {
  const [humanName, setHumanName] = useState("");
  const [isHumanNameMissing, setIsHumanNameMissing] = useState(false);
  const [duplicateName, setDuplicateName] = useState(false);
  const inputRef = useRef(null);
  const isMobile = useMobile();


  const imageUrl = `/icons/send_message_filled.svg`;

  useEffect(() => {
    // Focus on the input field when the component mounts
    // Unle
    if (!isMobile) {
      inputRef.current.focus();
    }
  }, []);

  function handleChange(e) {
    const inputValue = e.target.value;
    const trimmedValue = inputValue.trim();

    setHumanName(inputValue);

    if (isDuplicateName(inputValue)) {
      setDuplicateName(true);
    } else {
      setDuplicateName(false);
    }

    if (!trimmedValue) {
      setIsHumanNameMissing(true);
    } else {
      setIsHumanNameMissing(false);
      const capitalizedHumanName = capitalizeFirstLetter(trimmedValue);
      setHumanName(capitalizedHumanName);
    }
  }

  function continueForward() {

    if (humanName && !isDuplicateName(humanName)) {
      onContinueForward({ humanName: humanName });
    } else if (isDuplicateName(humanName)) {
      setDuplicateName(true);
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

  function isDuplicateName(check) {
    let names = participants.map(p => p.name);
    //Because each value in the Set has to be unique, the value equality will be checked.
    names.push(check);
    return (new Set(names).size !== names.length);
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
        {/* Adding an empty form, so that mobile keyboards will show the "go" button */}
        <form action="">
          <input
            ref={inputRef}
            style={inputStyle}
            type="text"
            value={humanName}
            placeholder="your name"
            onChange={handleChange}
            onKeyDown={handleKeyDown}
          />
          <input type="submit" style={{ position: "absolute", left: '-9999px' }} />
        </form>
        <img
          src={imageUrl}
          alt="continue"
          style={imageStyle}
          onClick={continueForward}
        />
      </div>
      <h3 style={{ visibility: (isHumanNameMissing || duplicateName) ? "" : "hidden" }}>
        {duplicateName ? "name must be unique in the council" : "enter your name to proceed"}
      </h3>
    </div>
  );
}

export default Name;
