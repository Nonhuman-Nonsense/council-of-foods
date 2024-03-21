import React from "react";

function Welcome() {
  const welcomeStyle = {
    zIndex: 10,
    color: "white",
    textAlign: "center",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center", // Center the content vertically
    alignItems: "center",
  };

  const contentStyle = {
    // Add padding to the bottom to push the content up slightly
    paddingBottom: "50%", // Adjust this value to control the shift
  };

  return (
    <div style={welcomeStyle}>
      {/* Wrap the text content for individual styling */}
      <div style={contentStyle}>
        <p>welcome to</p>
        <h1>COUNCIL OF FOODS</h1>
      </div>
    </div>
  );
}

export default Welcome;
