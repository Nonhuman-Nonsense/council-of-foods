import React from "react";
import NameInput from "./NameInput";

function Welcome({ onContinueForward }) {
  return (
    <div className="text-container">
      <div>
        <h2>welcome to</h2>
        <h1>COUNCIL OF FOODS</h1>
      </div>
      <NameInput onContinueForward={onContinueForward} />
    </div>
  );
}

export default Welcome;
