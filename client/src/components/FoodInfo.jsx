import React from "react";
import { capitalizeFirstLetter } from "../utils.js";

function FoodInfo({ food }) {
  if (!food) {
    return null;
  }

  console.log(food.name);

  const capitalizedFoodName = capitalizeFirstLetter(food.name);

  return (
    <div>
      <h2>{capitalizedFoodName}</h2>
      <div>
        <h4 className="italic">Lorem</h4>
        <h4 className="italic">Variety: {food.variety}</h4>
        <h4 className="italic">Origin: {food.origin}</h4>
      </div>
      <h4>
        Lorem ipsum dolor, sit amet consectetur adipisicing elit.
        <br />
        Consequuntur laboriosam necessitatibus dolor nemo nihil similique
        <br />
        laudantium quisquam vitae esse animi!
      </h4>
    </div>
  );
}

export default FoodInfo;
