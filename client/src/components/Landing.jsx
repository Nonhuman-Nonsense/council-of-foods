import React from "react";
import HumanNameInput from "./HumanNameInput";

function Welcome({ onContinueForward }) {

  const wrapper = {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
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
        <HumanNameInput onContinueForward={onContinueForward} />
      </div>
    </div>
  );
}

export default Welcome;
