import React, { useState } from "react";
import foodData from "../../prompts/foods.json";
import FoodButton from "./FoodButton";
import { toTitleCase, useMobile, useMobileXs } from "../../utils";

//We need to save the original water prompt, otherwise it is replace by some weird React black magic
const originalWaterPrompt = foodData.foods[0].prompt;

function SelectFoods({ topic, onContinueForward }) {
  const isMobile = useMobile();
  const isMobileXs = useMobileXs();
  const foods = foodData.foods; // Make sure this is defined before using it to find 'water'
  const waterFood = foods.find((food) => food.name === "Water"); // Find the 'water' food item

  // Initialize selectedFoods with the 'water' item if it exists
  const [selectedFoods, setSelectedFoods] = useState(
    waterFood ? [waterFood] : []
  );
  const [currentFood, setCurrentFood] = useState(null);

  const minFoods = 2 + 1; // 2 plus water
  const maxFoods = 6 + 1; // 6 plus water

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

  function randomizeSelection() {
    const amount = Math.floor(Math.random() * (maxFoods - minFoods + 1)) + minFoods - 1;
    const randomfoods = foods.slice(1).sort(() => 0.5 - Math.random()).slice(0, amount);
    setSelectedFoods([waterFood, ...randomfoods]);
  }

  function deselectFood(food) {
    setSelectedFoods((prevFoods) => prevFoods.filter((f) => f !== food));
  }

  const discriptionStyle = {
    transition: "opacity ease",
    opacity: currentFood === null ? 1 : 0,
    transitionDuration: currentFood === null ? "1s" : "0ms",
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
        <h1 style={{margin: isMobile && "0"}}>THE FOODS</h1>
        <div
          style={{
            position: "relative",
            height: isMobile ? (isMobileXs ? "190px" :"240px") :"380px",
            width: isMobile ? "587px" : "500px"
          }}
        >
          <div style={discriptionStyle}>
            <p style={{margin: 0}}>Council of Foods meeting on</p>
            <h3>{toTitleCase(topic.title)}</h3>
            <div>
              {selectedFoods.length < 2 ? <p>please select 2-6 foods for the discussion</p> : <><p>will be attended by:</p>
                <div>{selectedFoods.map((food) => <p style={{margin: 0}} key={food.name}>{food.name}</p>)}</div>
                </>}
            </div>
          </div>
          <FoodInfo food={currentFood} />
        </div>
      </div>
      <div style={{height: isMobile ? "93px" : "110px"}}>
        <div style={{ display: "flex", alignItems: "center" }}>
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
        <div style={{display: "flex", justifyContent: "center", marginTop: isMobileXs ? "2px" : "5px"}}>
        {selectedFoods.length < 2 && <button onClick={randomizeSelection} style={{...discriptionStyle, margin: isMobileXs ? "0" : "8px 0", position: "absolute"}}>Randomize</button>}
        {selectedFoods.length >= minFoods && selectedFoods.length <= maxFoods ?
          <button onClick={continueForward} style={{margin: isMobileXs ? "0" : "8px 0"}}>Start</button> :
          (currentFood !== null || selectedFoods.length === 2) && <h4 style={{margin: isMobile && (isMobileXs ? "0" : "7px")}}>please select 2-6 foods for the discussion</h4>
        }
        </div>
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
      <h2 style={{margin: isMobile ? "0" : "-15px 0 0 0"}}>{toTitleCase(food.name)}</h2>
      <p style={{margin: isMobile ? "0" : ""}}>{food.description?.split('\n').map((item, key) => {
          return <span key={key}>{item}<br/></span>
        })}
      </p>
    </div>
  );
}

export default SelectFoods;
