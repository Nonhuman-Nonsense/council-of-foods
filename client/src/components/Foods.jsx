// Import statements are consolidated at the top.
import React, { useState } from "react";
import FoodButton from "./FoodButton";

function Foods({ topic, onContinueForward }) {
  // State and variables declaration section.
  const [selectedFoods, setSelectedFoods] = useState([]);
  const moderator = "water";
  const foods = ["banana", "bratwurst", "lollipop", "meat", "potato", "tomato"];
  const minFoods = 2;
  const maxFoods = 5;
  // Function to handle proceeding forward if the conditions are met.
  function continueForward() {
    if (selectedFoods.length >= minFoods && selectedFoods.length <= maxFoods) {
      onContinueForward({ foods: selectedFoods });
    }
  }

  // Function to handle the selection of a food item.
  function selectFood(foodName) {
    if (selectedFoods.length < maxFoods && !selectedFoods.includes(foodName)) {
      setSelectedFoods((prevFoods) => [...prevFoods, foodName]);
    }
  }

  // Function to handle the deselection of a food item.
  function deselectFood(foodName) {
    setSelectedFoods((prevFoods) =>
      prevFoods.filter((food) => food !== foodName)
    );
  }

  // JSX structure of the component.
  return (
    <div className="text-container">
      <div>
        <h1>THE FOODS:</h1>
        <h4>
          Please select 2-5 foods
          <br /> to participate in the discussion about:
        </h4>
        <h4>{topic}</h4>
      </div>
      <div className="food-buttons">
        <FoodButton name={moderator} />
        {foods.map((food) => (
          <FoodButton
            key={food}
            name={food}
            onSelectFood={selectFood}
            onDeselectFood={deselectFood}
            isSelected={selectedFoods.includes(food)}
            selectLimitReached={selectedFoods.length >= maxFoods}
          />
        ))}
      </div>
      <button
        className={`${
          selectedFoods.length >= minFoods && selectedFoods.length <= maxFoods
            ? ""
            : "hidden"
        } outline-button`}
        onClick={continueForward}
      >
        Start
      </button>
    </div>
  );
}

export default Foods;
