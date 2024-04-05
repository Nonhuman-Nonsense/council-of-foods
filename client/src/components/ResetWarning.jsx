import React from "react";
import { capitalizeFirstLetter } from "../utils";

function ResetWarning({ message, onReset, onCancel }) {
  return (
    <div className="wrapper">
      <div className="text-container" style={{ justifyContent: "center" }}>
        <h4>
          {message
            ? capitalizeFirstLetter(message)
            : capitalizeFirstLetter("this")}{" "}
          will restart the discussion
        </h4>
        <div>
          <button
            className="outline-button"
            onClick={onReset}
            style={{ marginRight: "9px" }}
          >
            I understand
          </button>
          <button
            className="outline-button"
            onClick={onCancel}
            style={{ marginLeft: "9px" }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default ResetWarning;
