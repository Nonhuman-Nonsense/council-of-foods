import React, { useState } from "react";
import foodData from "../../prompts/foods.json";
import FoodButton from "./FoodButton";
import { toTitleCase, useMobile } from "../../utils";

//We need to save the original water prompt, otherwise it is replace by some weird React black magic
const originalWaterPrompt = foodData.foods[0].prompt;

function SelectFoods({ topic, onContinueForward }) {
  const isMobile = useMobile();
  const foods = foodData.foods; // Make sure this is defined before using it to find 'water'
  const waterFood = foods.find((food) => food.name === "Water"); // Find the 'water' food item

  // Initialize selectedFoods with the 'water' item if it exists
  const [selectedFoods, setSelectedFoods] = useState(
    waterFood ? [waterFood] : []
  );
  const [currentFood, setCurrentFood] = useState(null);

  const minFoods = 2 + 1; // 2 plus water
  const maxFoods = 6 + 1; // 5 plus water

  function continueForward() {
    if (selectedFoods.length >= minFoods && selectedFoods.length <= maxFoods) {
      //Modify waters invitation prompt, with the name of the selected participants
      let participants = "";
      selectedFoods.forEach(function (food, index) {
        if (index !== 0) participants += toTitleCase(food.name) + ", ";
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
        height: "75%",
        justifyContent: "space-between",
        alignItems: "center"
      }}
    >
      <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <h1 style={{margin: isMobile && "0", fontSize: isMobile && "33px"}}>THE FOODS</h1>
        <div
          style={{
            position: "relative",
            height: isMobile ? "240px" :"380px",
            width: isMobile ? "587px" : "500px"
          }}
        >
          <div style={discriptionStyle}>
            <p>
              Please select 2-6 foods
              <br /> to participate in the discussion about:
            </p>
            <h4>{toTitleCase(topic.title)}</h4>
          </div>
          <FoodInfo food={currentFood} />
        </div>
      </div>
      <div style={{height: isMobile ? "93px" : "110px"}}>
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
        {selectedFoods.length >= minFoods && selectedFoods.length <= maxFoods ?
          <button onClick={continueForward} style={{margin: "8px 0"}}>Start</button> :
          <h4 style={{visibility: currentFood === null ? "hidden" : "", margin: isMobile && "7px"}}>
            please select 2-6 foods for the discussion
          </h4>
        }
      </div>
    </div>
  );
}

function FoodInfo({ food }) {
  const isMobile = useMobile();
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
      <h2 style={{margin: isMobile ? "0" : ""}}>{toTitleCase(food.name)}</h2>
      <p style={{margin: isMobile ? "0" : ""}}>{food.description?.split('\n').map((item, key) => {
          return <span key={key}>{item}<br/></span>
        })}
      </p>
    </div>
  );
}

export default SelectFoods;
