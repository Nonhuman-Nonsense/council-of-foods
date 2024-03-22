import React, { useState } from "react";

function FoodButton({ name, onSelectFood, onDeselectFood }) {
  const [isSelected, setIsSelected] = useState(false);

  const imageUrl = `/images/foods/${name}.png`;

  function handleClickFood() {
    if (!isSelected) {
      // Select food
      onSelectFood(name);
    } else {
      // Deselect food
      onDeselectFood(name);
    }

    setIsSelected(!isSelected);
  }

  const buttonStyle = {
    marginLeft: "5px",
    marginRight: "5px",
    backgroundColor: "black",
    width: "75px",
    height: "75px",
    borderRadius: "50%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",

    border: isSelected ? "2px solid white" : "2px solid transparent", // Apply a white border if selected
  };

  const imageStyle = {
    width: "80%",
    height: "80%",
    objectFit: "cover",
    cursor: "pointer",
    borderRadius: "50%",
  };

  return (
    <div
      className="food-button"
      style={buttonStyle}
    >
      <img
        src={imageUrl}
        alt={name}
        style={imageStyle}
        onClick={handleClickFood}
      />
    </div>
  );
}

export default FoodButton;
