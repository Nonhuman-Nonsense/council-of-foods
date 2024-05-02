import React from "react";

function Completed({ onContinue, onWrapItUp }) {
  return (
    <div>
      <h4>The conversation is completed.</h4>
      <div>
        <button
          className="outline-button"
          onClick={onContinue}
          style={{ marginRight: "9px" }}
        >
          Continue the conversation
        </button>
        <button
          className="outline-button"
          onClick={onWrapItUp}
          style={{ marginLeft: "9px" }}
        >
          Wrap it up
        </button>
      </div>
    </div>
  );
}

export default Completed;
