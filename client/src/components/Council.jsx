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

  const foodStyle = {
    width: "120px",
    height: "120px",
  };

  const calculateShadow = (index, total) => {
    const middleIndex = (total - 1) / 2;
    const distanceIncrement = 2; // Increment for distance per index away from the middle

    // Calculate the distance based on the index's distance from the middle
    const distance = Math.abs(index - middleIndex) * distanceIncrement;

    let x = 0;

    if (index < middleIndex) {
      x = -distance; // Left shadow
    } else if (index > middleIndex) {
      x = distance; // Right shadow
    }

    return `${x}px 3px 5px rgba(0,0,0,0.5)`;
  };
  const foodItemStyle = (index, total) => {
    const archHeightVW = 3;
    const verticalOffsetVW = 6.5;

    const middleIndex = (total - 1) / 2;

    const a = archHeightVW / middleIndex ** 2;

    const topValueVW = a * (index - middleIndex) ** 2;

    return {
      position: "absolute",
      left: `${(index / (total - 1)) * 100}%`,
      top: `calc(${topValueVW}vw - ${verticalOffsetVW}vw)`,
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
            <img
              src={`/images/foods/${food}.png`}
              style={foodStyle}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default Council;
