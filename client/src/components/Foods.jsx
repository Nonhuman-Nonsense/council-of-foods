import React, { useState } from "react";
import FoodButton from "./FoodButton";
import FoodInfo from "./FoodInfo";
import { capitalizeFirstLetter } from "../utils";

function Foods({ topic, onContinueForward }) {
  const [selectedFoods, setSelectedFoods] = useState([]);
  const [currentFood, setCurrentFood] = useState("");

  const moderator = "water";
  const foods = ["banana", "bratwurst", "lollipop", "meat", "potato", "tomato"];
  const minFoods = 2;
  const maxFoods = 5;

  function continueForward() {
    if (selectedFoods.length >= minFoods && selectedFoods.length <= maxFoods) {
      onContinueForward({ foods: selectedFoods });
    }
  }

  function handleOnMouseEnter(foodName) {
    setCurrentFood(foodName);
  }

  function handleOnMouseLeave() {
    setCurrentFood("");
  }

  function selectFood(foodName) {
    if (selectedFoods.length < maxFoods && !selectedFoods.includes(foodName)) {
      setSelectedFoods((prevFoods) => [...prevFoods, foodName]);
    }
  }

  function deselectFood(foodName) {
    setSelectedFoods((prevFoods) =>
      prevFoods.filter((food) => food !== foodName)
    );
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
                opacity: currentFood === "" ? 1 : 0,
                pointerEvents: currentFood === "" ? "all" : "none",
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
                opacity: currentFood !== "" ? 1 : 0,
                pointerEvents: currentFood !== "" ? "all" : "none",
              }}
            >
              <FoodInfo foodName={currentFood} />
            </div>
          </div>
        </div>
        <div>
          <div className="food-buttons">
            <FoodButton
              foodName={moderator}
              onMouseEnter={handleOnMouseEnter}
              onMouseLeave={handleOnMouseLeave}
            />
            {foods.map((food) => (
              <FoodButton
                key={food}
                foodName={food}
                onSelectFood={selectFood}
                onDeselectFood={deselectFood}
                onMouseEnter={handleOnMouseEnter}
                onMouseLeave={handleOnMouseLeave}
                isSelected={selectedFoods.includes(food)}
                selectLimitReached={selectedFoods.length >= maxFoods}
              />
            ))}
          </div>
          <h4 className={`${currentFood === "" ? "hidden" : ""}`}>
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
