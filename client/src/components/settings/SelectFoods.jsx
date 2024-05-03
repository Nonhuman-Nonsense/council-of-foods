import React, { useState } from "react";
import foodData from "../../prompts/foods.json";
import FoodButton from "./FoodButton";
import { toTitleCase } from "../../utils";

//We need to save the original water prompt, otherwise it is replace by some weird React black magic
const originalWaterPrompt = foodData.foods[0].prompt;

function SelectFoods({ topic, onContinueForward }) {
  const foods = foodData.foods; // Make sure this is defined before using it to find 'water'
  const waterFood = foods.find((food) => food.name === "Water"); // Find the 'water' food item

  // Initialize selectedFoods with the 'water' item if it exists
  const [selectedFoods, setSelectedFoods] = useState(
    waterFood ? [waterFood] : []
  );
  const [currentFood, setCurrentFood] = useState(null);

  const minFoods = 2 + 1; // 2 plus water
  const maxFoods = 5 + 1; // 5 plus water

  function continueForward() {
    if (selectedFoods.length >= minFoods && selectedFoods.length <= maxFoods) {
      //Modify waters invitation prompt, with the name of the selected participants
      let participants = "";
      selectedFoods.forEach(function (food, index) {
        if (index != 0) participants += toTitleCase(food.name) + ", ";
      });
      participants = participants.substring(0, participants.length - 2);
      let replacedFoods = selectedFoods;
      replacedFoods[0].prompt = originalWaterPrompt.replace(
        "[FOODS]",
        participants
      );

      onContinueForward({ foods: replacedFoods });
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "85%",
        justifyContent: "space-between",
        alignItems: "center"
      }}
    >
      <div style={{ height: "100%", width: "65%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <h1>THE FOODS</h1>
        <div
          style={{
            position: "relative",
            height: "100%",
          }}
        >
          <div style={discriptionStyle}>
            <p>
              Please select 2-5 foods
              <br /> to participate in the discussion about:
            </p>
            <h4>{toTitleCase(topic.title)}</h4>
          </div>
          <FoodInfo food={currentFood} />
        </div>
      </div>
      <div>
        <div style={{ display: "flex" }}>
          {foods.map((food) => (
            <FoodButton
              key={food.name}
              food={food}
              onMouseEnter={() => handleOnMouseEnter(food)}
              onMouseLeave={handleOnMouseLeave}
              onSelectFood={food === waterFood ? undefined : selectFood}
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
            selectedFoods.length >= minFoods && selectedFoods.length <= maxFoods
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

function FoodInfo({ food }) {
  if (!food) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        height: "100%",
        transition: "opacity 0.5s ease",
        opacity: food !== null ? 1 : 0,
        pointerEvents: food !== null ? "all" : "none",
      }}
    >
      <h2>{toTitleCase(food.name)}</h2>
      <p>{food.description?.split('\n').map((item, key) => {
          return <span key={key}>{item}<br/></span>
        })}
      </p>
    </div>
  );
}

export default SelectFoods;
