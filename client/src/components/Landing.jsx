import React from "react";
import HumanNameInput from "./HumanNameInput";

function Welcome({ onContinueForward }) {

  const welcomeStyle = {
    display: "flex",
    flexDirection: "column",
    height: "80%",
    justifyContent: "space-between",
  };

  return (
      <div style={welcomeStyle}>
        <div>
          <h2>welcome to</h2>
          <h1>COUNCIL OF FOODS</h1>
        </div>
        <HumanNameInput onContinueForward={onContinueForward} />
      </div>
  );
}

export default Welcome;
