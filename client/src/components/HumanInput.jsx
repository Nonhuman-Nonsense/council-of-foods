import React from "react";

function HumanInput({ onAddNewTopic }) {
  function handleOnInput(e) {
    onAddNewTopic(e.target.value);
  }

  return (
    <div style={{ pointerEvents: "auto" }}>
      <textarea
        onInput={handleOnInput}
        rows="2"
        placeholder="your input"
      />
    </div>
  );
}

export default HumanInput;
