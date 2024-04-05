import React from "react";

function TextOutput() {
  const textOutputStyle = {
    fontFamily: "Arial, sans-serif", 
  };

  return (
    <div>
      <h2 style={textOutputStyle}>
        Lorem ipsum dolor sit.
        <br />
        Lorem ipsum dolor sit amet.
      </h2>
    </div>
  );
}

export default TextOutput;
