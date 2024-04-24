import React from "react";

function TextOutput({ currentMessageTextSnippet }) {
  const textOutputStyle = {
    fontFamily: "Arial, sans-serif",
    backgroundColor: "rgba(0,0,0,0.7)",
  };

  return (
    <div style={{ textAlign: "center" }}>
      <h2 style={textOutputStyle}>{currentMessageTextSnippet || ""}</h2>
    </div>
  );
}

export default TextOutput;
