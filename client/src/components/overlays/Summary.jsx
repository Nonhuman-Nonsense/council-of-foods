import React from "react";
import { useMobile } from "../../utils";

function Summary({ summary, meetingId }) {

  const isMobile = useMobile();

  const wrapper = {
    height: isMobile ? "calc(100vh - 55px)" : "calc(100vh - 60px - 56px - 20px)",
    marginBottom: isMobile ? "45px" : "56px",
    marginTop: !isMobile && "20px",
    width: "600px",
    overflowY:"auto"
  };

  const protocol = {
    textAlign: "left",
    whiteSpace: "pre-wrap",
  };

  return (
    <div style={wrapper} className="scroll">
      <h2>COUNCIL OF FOODS</h2>
      <h3>Meeting #{meetingId}</h3>
      <div style={protocol}>
        {summary.text}
      </div>
    </div>
  );
}

export default Summary;
