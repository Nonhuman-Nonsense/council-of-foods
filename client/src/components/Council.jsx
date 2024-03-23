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

  // Styles for the table container
  const foodsContainerStyle = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "80%",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
  };

  const calculateShadow = (index, total) => {
    const angle = (360 / total) * index;
    const x = Math.cos((angle * Math.PI) / 180).toFixed(2);
    const y = Math.sin((angle * Math.PI) / 180).toFixed(2);
    return `${x * 3}px ${y * 3}px 5px rgba(0,0,0,0.5)`;
  };

  const foodItemStyle = (index, total) => {
    const archHeightVW = 3; // Arch height in vw units
    const verticalOffsetVW = 7; // Default value for wider screens

    const middleIndex = (total - 1) / 2;

    const a = archHeightVW / middleIndex ** 2;

    const topValueVW = a * (index - middleIndex) ** 2;

    return {
      position: "absolute",
      left: `${(index / (total - 1)) * 100}%`,
      top: `calc(${topValueVW}vw - ${verticalOffsetVW}vw)`, // Use calc() to combine vw units and the fixed pixel offset
      transform: "translate(-50%, -50%)",
      boxShadow: calculateShadow(index, total),
    };
  };

  return (
    <div style={councilStyle}>
      <h1>Welcome to the council {name}</h1>
      <h1>Topic: {topic}</h1>
      <div style={foodsContainerStyle}>
        {foods.map((food, index) => (
          <div
            key={index}
            style={foodItemStyle(index, foods.length)}
          >
            {food}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Council;
