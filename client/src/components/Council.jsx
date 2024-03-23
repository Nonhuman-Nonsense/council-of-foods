import React from "react";

function Council({ options }) {
  const { name, topic, foods } = options;
  const councilStyle = {
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
    <div style={councilStyle}>
      <h1>Welcome to the council {name}</h1>
      <h1>Topic: {topic}</h1>
      <h1>Foods: {foods.join(", ")}</h1>
    </div>
  );
}

export default Council;
