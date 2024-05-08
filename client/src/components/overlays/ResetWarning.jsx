import React from "react";
import { capitalizeFirstLetter } from "../../utils";

function ResetWarning({ message, onReset, onCancel }) {
  return (
    <div>
      <h4>
        {message ? capitalizeFirstLetter(message) : "This"} will restart the
        discussion
      </h4>
      <div>
        <button
          onClick={onReset}
          style={{ marginRight: "9px" }}
        >
          I understand
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
