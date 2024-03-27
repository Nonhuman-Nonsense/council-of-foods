import React from "react";
import FoodItem from "./FoodItem";
import useWindowSize from "../hooks/useWindowSize";

function Council({ options }) {
  const { foods } = options;
  const { width: screenWidth } = useWindowSize();

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

  return (
    <div className="wrapper">
      <div style={foodsContainerStyle}>
        {foods.map((food, index) => (
          <FoodItem
            key={index}
            food={food}
            index={index}
            total={foods.length}
            screenWidth={screenWidth}
          />
        ))}
      </div>
      <div className="text-container" style={{ justifyContent: "end" }}>
        <div>
          <h1>Text goes here</h1>
        </div>
      </div>
    </div>
  );
}

export default Council;
