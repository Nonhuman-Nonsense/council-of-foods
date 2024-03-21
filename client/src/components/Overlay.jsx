import React from "react";

function Overlay({ children }) {
  const overlayStyle = {
    position: "absolute",
    top: 0, // Start from the very top
    left: 0, // Start from the very left
    height: "100%", // Cover full parent height
    width: "100%", // Cover full parent width
    backgroundColor: "rgba(0, 0, 0, 0.5)", // Semi-transparent black
  };

  return <div style={overlayStyle}>{children}</div>;
}

export default Overlay;
