import React, { useState, useRef, useEffect } from "react";
import About from "../overlays/About";
import RotateDevice from '../RotateDevice';
import { capitalizeFirstLetter } from "../../utils";
import { useMediaQuery } from 'react-responsive'

function Landing({ onContinueForward }) {

  const isPortrait = useMediaQuery({ query: '(orientation: portrait)' })

  const wrapper = {
    width: "100%",
    height: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  };

  const welcomeStyle = {
    display: "flex",
    flexDirection: "column",
    height: "85%",
    alignItems: "center",
    justifyContent: "space-between",
  };

  return (
    <div style={wrapper}>
      <div style={welcomeStyle}>

        <div>
          <img style={{width: '95px'}} src='/logos/council_logo_white.svg' alt="Council of Foods logo" />
          <h2 style={{marginBottom: "-10px"}}>welcome to</h2>
          <h1>COUNCIL OF FOODS</h1>
        </div>
        
        {isPortrait ?
          <RotateDevice />
        :
        (<div style={{maxWidth: "380px"}}>
          <p style={{marginBottom: "30px"}}>A political arena where the foods themselves discuss the broken food system, through the use of artificial intelligence. Join the discussion on what actions need to be taken to form a locally and globally sustainable food system!</p>
          <div><button onClick={() => onContinueForward()}>Let's go!</button></div>
        </div>)
        }
      </div>
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
      <h3>please type your name to enter:</h3>
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

export default Landing;
