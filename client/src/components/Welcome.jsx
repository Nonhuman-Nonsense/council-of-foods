import React from "react";
import NameInput from "./NameInput";

function Welcome({ onEnterSetup }) {
  const welcomeStyle = {
    zIndex: 10,
    color: "white",
    textAlign: "center",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-around",
    alignItems: "center",
  };

  return (
    <div style={welcomeStyle}>
      {/* Wrap the text content for individual styling */}
      <div>
        <h2>welcome to</h2>
        <h1>COUNCIL OF FOODS</h1>
      </div>
      <NameInput onEnterSetup={onEnterSetup} />
    </div>
  );
}

export default Welcome;
