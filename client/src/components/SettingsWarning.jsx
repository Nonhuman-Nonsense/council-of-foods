import React from "react";

function SettingsWarning({ onChangeSettings, onCancel }) {
  return (
    <div>
      <h4>Changing the settings will restart the discussion</h4>
      <button
        className="outline-button"
        onClick={() => onChangeSettings()}
        style={{ marginRight: "9px" }}
      >
        I understand
      </button>
      <button
        className="outline-button"
        onClick={() => onCancel()}
        style={{ marginLeft: "9px" }}
      >
        Cancel
      </button>
    </div>
  );
}

export default SettingsWarning;
