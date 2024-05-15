import React from "react";
import About from "../overlays/About";

function Welcome({ humanName, onContinueForward }) {


  return (
      <div>
        <div>
          <h3>Dear {humanName},</h3>
          <About isSingle />
        </div>
        <button
          onClick={() => onContinueForward()}
        >
          Next
        </button>
      </div>
  );
}

export default Welcome;
