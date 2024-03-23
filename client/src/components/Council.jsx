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
    justifyContent: "end",
    alignItems: "center",
  };

  const textAreaStyle = {
    width: "90%",
    transform: "translateY(-140px)", // Move the textarea up by 10px
  };

  const foodsContainerStyle = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "70%",
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
  };

  const foodImageStyle = {
    width: "120px",
    height: "120px",
  };

  const foodImageShadowStyle = (index, total) => {
    let leftPosition = calculateLeftPosition(index, total);

    // Determine the angle of rotation
    const rotationAngle = leftPosition * 1.8;

    return {
      zIndex: -1,
      position: "absolute",
      top: "5px",
      left: `${leftPosition}px`,
      filter:
        "blur(3px) brightness(0%) saturate(100%) invert(0%) sepia(100%) hue-rotate(180deg) contrast(100%)",
      opacity: 0.6,
      transformOrigin: "bottom center", // Set the origin to the bottom center
      transform: `rotate(${rotationAngle}deg)`, // Apply rotation transformation
    };
  };

  const calculateLeftPosition = (index, total) => {
    const middleIndex = (total - 1) / 2;
    const distanceIncrement = 10; // Adjust as needed
    const distance = (index - middleIndex) * distanceIncrement; // Calculate distance from middle index
    return distance; // Return distance as the left position
  };

  const foodItemStyle = (index, total) => {
    const archHeightVW = 1.8;
    const verticalOffsetVW = 7;

    const middleIndex = (total - 1) / 2;

    const left = (index / (total - 1)) * 100;

    const distanceFromCenter = Math.abs(index - middleIndex);
    const top = archHeightVW * distanceFromCenter - verticalOffsetVW;

    return {
      position: "absolute",
      left: `${left}%`, // Set the left position
      top: `${top}vw`, // Set the top position
      transform: "translate(-50%, -50%)",
    };
  };

  return (
    <div style={councilStyle}>
      <textarea
        className="text-input"
        rows="5"
        style={textAreaStyle}
        disabled
      ></textarea>
      <div style={foodsContainerStyle}>
        {foods.map((food, index) => (
          <div
            key={index}
            style={foodItemStyle(index, foods.length)}
          >
            <img
              src={`/images/foods/${food}.png`}
              style={foodImageStyle}
            />
            <img
              src={`/images/foods/${food}.png`}
              style={{
                ...foodImageStyle,
                ...foodImageShadowStyle(index, foods.length),
                backgroundImage: `url(/images/foods/${food}.png)`,
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default Council;
