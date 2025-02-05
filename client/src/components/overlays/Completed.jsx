import React from "react";

function Completed({ onContinue, onWrapItUp, canExtendMeeting }) {

  return (
    <div>
      <h2>Is that it?</h2>
      <div>
        <p>
          This meeting is starting to get long-winded,
          <br />
          is it time to come to a conclusion?
          <br /><br />
        </p>
        <button
          onClick={onWrapItUp}
          style={{ marginRight: "9px" }}
        >
          Yes, let's wrap it up!
        </button>
        {canExtendMeeting && (
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
