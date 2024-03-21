import React from "react";

function FoodButton({ name }) {
  const imageUrl = `/images/foods/${name}.png`;

  return (
    <div className="food-button">
      <img
        src={imageUrl}
        alt={name}
        style={{ borderRadius: "50%" }}
      />
    </div>
  );
}

export default FoodButton;
