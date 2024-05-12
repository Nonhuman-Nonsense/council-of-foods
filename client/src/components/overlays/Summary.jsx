import React from "react";

function Summary({ summary, meetingId }) {

  const wrapper = {
    height: "calc(100vh - 110px - 56px)",
    marginBottom: "56px",
    width: "600px",
    overflow:"scroll"
  };

  const protocol = {
    textAlign: "left",
    whiteSpace: "pre-wrap",
  };

  const paragraph = {
    margin: "0",
  };

  return (
    <div style={wrapper}>
      <h2>COUNCIL OF FOODS</h2>
      <h3>Meeting #{meetingId}</h3>
      <div style={protocol}>
        {summary.text}
      </div>
    </div>
  );
}

export default Summary;
