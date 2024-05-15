import React from "react";

function Completed({ onContinue, onWrapItUp, continuations }) {
  const maxContinuations = 2;

  return (
    <div>
      <h3>Is that it?</h3>
      <div>
        <p>
          This meeting is starting to get long-winded,
          <br />
          is it time to come to a conclusion?
        </p>
        <button
          onClick={onWrapItUp}
          style={{ marginRight: "9px" }}
        >
          Yes, let's wrap it up!
        </button>
        {continuations < maxContinuations && (
          <button
            onClick={onContinue}
            style={{ marginLeft: "9px" }}
          >
            No, continue a bit more.
          </button>
        )}
        <div style={{ height: "60px" }} />
      </div>
    </div>
  );
}

export default Completed;
