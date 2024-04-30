import React, { useState } from "react";
import foodData from "../settings/foods.json";
import FoodButton from "./FoodButton";
import FoodInfo from "./FoodInfo";
import { capitalizeFirstLetter } from "../utils";

function Foods({ topic, onContinueForward }) {
  const foods = foodData.foods; // Make sure this is defined before using it to find 'water'
  const waterFood = foods.find((food) => food.name === "water"); // Find the 'water' food item

  // Initialize selectedFoods with the 'water' item if it exists
  const [selectedFoods, setSelectedFoods] = useState(
    waterFood ? [waterFood] : []
  );
  const [currentFood, setCurrentFood] = useState(null);

  const minFoods = 2;
  const maxFoods = 5;

  function continueForward() {
    if (selectedFoods.length >= minFoods && selectedFoods.length <= maxFoods) {
      onContinueForward({ foods: selectedFoods });
    }
  }

  function handleOnMouseEnter(food) {
    setCurrentFood(food);
  }

  function handleOnMouseLeave() {
    setCurrentFood(null);
  }

  function selectFood(food) {
    if (selectedFoods.length < maxFoods && !selectedFoods.includes(food)) {
      setSelectedFoods((prevFoods) => [...prevFoods, food]);
    }
  }

  function deselectFood(food) {
    setSelectedFoods((prevFoods) => prevFoods.filter((f) => f !== food));
  }

  const discriptionStyle = {
    transition: "opacity 0.5s ease",
    opacity: currentFood === null ? 1 : 0,
    pointerEvents: currentFood === null ? "all" : "none",
  };

  return (
    <div style={{display: "flex", flexDirection: "column", height: "85%", justifyContent: "space-between"}}>
        <div style={{height: "100%", display: "flex", flexDirection: "column"}}>
          <h1>THE FOODS</h1>
          <div style={{ position: "relative", height: "100%" }}>
            <div style={discriptionStyle}>
              <p>
                Please select 2-5 foods
                <br /> to participate in the discussion about:
              </p>
              <h4>{capitalizeFirstLetter(topic)}</h4>
            </div>
            <div
              style={{
                position: "absolute",
                top: 0,
                height:"100%",
                overflow: "scroll",
                transition: "opacity 0.5s ease",
                opacity: currentFood !== null ? 1 : 0,
                pointerEvents: currentFood !== null ? "all" : "none",
              }}
            >
              <FoodInfo food={currentFood} />
            </div>
          </div>
        </div>
        <div>
          <div style={{display: "flex"}}>
            {foods.map((food) => (
              <FoodButton
                key={food.name}
                food={food}
                onMouseEnter={() => handleOnMouseEnter(food)}
                onMouseLeave={handleOnMouseLeave}
                onSelectFood={(food === waterFood ? undefined : selectFood)}
                onDeselectFood={deselectFood}
                isSelected={selectedFoods.includes(food)}
                selectLimitReached={selectedFoods.length >= maxFoods}
              />
            ))}
          </div>
          <h4 className={`${currentFood === null ? "hidden" : ""}`}>
            please select 2-5 foods for the discussion
          </h4>
          <button
            className={`${
              selectedFoods.length >= minFoods &&
              selectedFoods.length <= maxFoods
                ? ""
                : "hidden"
            } outline-button`}
            onClick={continueForward}
          >
            Start
          </button>
        </div>
        </div>
  );
}

export default Foods;
