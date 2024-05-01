import React from "react";
import { toTitleCase } from "../utils.js";

function FoodInfo({ food }) {
  if (!food) {
    return null;
  }

  const capitalizedFoodName = toTitleCase(food.name);

  return (
    <div>
      <h2>{capitalizedFoodName}</h2>
      <p>{food.description?.split('\n').map((item, key) => {
          return <span key={key}>{item}<br/></span>
        })}
      </p>
    </div>
  );
}

export default FoodInfo;
