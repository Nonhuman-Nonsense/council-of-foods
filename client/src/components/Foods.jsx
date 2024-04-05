import React, { useState } from "react";
import foodData from "../foods.json";
import FoodButton from "./FoodButton";
import FoodInfo from "./FoodInfo";
import { capitalizeFirstLetter } from "../utils";

function Foods({ topic, onContinueForward }) {
  const [selectedFoods, setSelectedFoods] = useState([]);
  const [currentFood, setCurrentFood] = useState(null);

  const moderator = "water";
  const foods = foodData.foods;

  const minFoods = 2;
  const maxFoods = 5;

  function continueForward() {
    if (selectedFoods.length >= minFoods && selectedFoods.length <= maxFoods) {
      onContinueForward({ foods: selectedFoods });
    }
  }

  function handleOnMouseEnter(food) {
    console.log("Setting current food:", food); // This should log the entire food object

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

  return (
    <div className="wrapper">
      <div className="text-container">
        <div>
          <h1>THE FOODS:</h1>
          <div
            style={{
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                transition: "opacity 0.5s ease",
                opacity: currentFood === null ? 1 : 0,
                pointerEvents: currentFood === null ? "all" : "none",
              }}
            >
              <h4>
                Please select 2-5 foods
                <br /> to participate in the discussion about:
              </h4>
              <h4>{capitalizeFirstLetter(topic)}</h4>
            </div>
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
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
          <div className="food-buttons">
            {foods.map((food) =>
              food.name === moderator ? (
                <FoodButton
                  key={food.name}
                  food={food}
                  onMouseEnter={handleOnMouseEnter}
                  onMouseLeave={handleOnMouseLeave}
                />
              ) : (
                <FoodButton
                  key={food.name}
                  food={food}
                  onMouseEnter={() => handleOnMouseEnter(food)}
                  onMouseLeave={handleOnMouseLeave}
                  onSelectFood={selectFood}
                  onDeselectFood={deselectFood}
                  isSelected={selectedFoods.includes(food)}
                  selectLimitReached={selectedFoods.length >= maxFoods}
                />
              )
            )}
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
    </div>
  );
}

export default Foods;
