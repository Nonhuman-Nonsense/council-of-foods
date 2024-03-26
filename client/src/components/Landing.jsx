import React from "react";
import HumanNameInput from "./HumanNameInput";

function Welcome({ onContinueForward }) {
  return (
    <div className="wrapper">
      <div className="text-container">
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
