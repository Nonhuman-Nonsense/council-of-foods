import React, { useState } from "react";
import FoodButton from "./FoodButton";

function Setup() {
  const [topic, setTopic] = useState(""); // Added state for the topic
  const [selectedFoods, setSelectedFoods] = useState([]);

  const foods = [
    "banana",
    "bratwurst",
    "lollipop",
    "meat",
    "potato",
    "tomato",
    "water",
  ];

  const welcomeStyle = {
    zIndex: 10,
    color: "white",
    textAlign: "center",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-around",
    alignItems: "center",
  };

  function enterCouncil() {
    console.log("Entering council...");

    console.log("Name: ", localStorage.getItem("name"));
    console.log("Topic: ", topic);
    console.log("Selected foods: ", selectedFoods);

    // First test call socket

    // let promptsAndOptions = {options: , topic: , characters: }

    // socket.emit("start_conversation", promptsAndOptions);

    // return {
    //   options: promptsAndOptions.options,
    //   topic: promptsAndOptions.rooms[currentRoom].topic,
    //   characters: promptsAndOptions.rooms[currentRoom].characters,
    // };
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      enterCouncil();
    }
  }

  function selectFood(foodName) {
    // Check if the foodName is already selected to prevent duplicates
    if (!selectedFoods.includes(foodName)) {
      setSelectedFoods([...selectedFoods, foodName]);
      console.log(`SELECTED ${foodName}`);
    }
  }

  function deselectFood(foodName) {
    // Filter out the foodName from the selectedFoods array to remove it
    const filteredFoods = selectedFoods.filter((food) => food !== foodName);
    setSelectedFoods(filteredFoods);
    console.log(`DESELECTED ${foodName}`);
  }

  return (
    <div style={welcomeStyle}>
      <div>
        <h4>
          Welcome to the Council of Foods - an assembly of diverse
          <br /> foods, addressing the broken food system through debate.
        </h4>
        <h4>
          To begin a meeting, decide on a topic
          <br /> & pick which foods will be participating!
        </h4>
      </div>
      <div>
        <h3>Topic:</h3>
        <textarea
          className="text-input"
          rows="2"
          cols="30"
          onKeyDown={handleKeyDown}
          onChange={(e) => setTopic(e.target.value)} // Update the state of the topic when input changes
        ></textarea>
      </div>
      <div>
        <h3>Foods:</h3>
        <div className="food-buttons">
          {foods.map((food) => (
            <FoodButton
              key={food}
              name={food}
              onSelectFood={selectFood}
              onDeselectFood={deselectFood}
            />
          ))}
        </div>
      </div>
      <button
        className="outline-button"
        onClick={enterCouncil}
      >
        Enter
      </button>
    </div>
  );
}

export default Setup;
