import React from "react";
import { capitalizeFirstLetter } from "../../utils";

function ResetWarning({ message, onReset, onCancel }) {
  return (
    <div>
      <h2>Start over?</h2>
      <h4>
        {message ? capitalizeFirstLetter(message) : "This"} will start everything from the beginning
      </h4>
      <div>
        <button
          onClick={onReset}
          style={{ marginRight: "9px" }}
        >
          Restart
        </button>
        <button
          onClick={onCancel}
          style={{ marginLeft: "9px" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export default ResetWarning;
