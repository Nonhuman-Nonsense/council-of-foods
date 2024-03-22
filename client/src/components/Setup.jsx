import React, { useState } from "react";
import FoodButton from "./FoodButton";

function Setup() {
  const [topic, setTopic] = useState("");
  const [selectedFoods, setSelectedFoods] = useState([]);
  const [isTopicMissing, setIsTopicMissing] = useState(false);
  const [areFoodsMissing, setAreFoodsMissing] = useState(false);

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
    // Reset validation states
    setIsTopicMissing(false);
    setAreFoodsMissing(false);

    // Validate if topic is entered
    if (!topic) {
      setIsTopicMissing(true);
    }

    // Validate if at least two foods are selected
    if (selectedFoods.length < 2) {
      setAreFoodsMissing(true);
    }

    // If both validations pass, log the values (simulate entering the council)
    if (topic && selectedFoods.length >= 2) {
      console.log("Entering council...");

      console.log("Name: ", localStorage.getItem("name"));
      console.log("Topic: ", topic);
      console.log("Selected foods: ", selectedFoods);
    }
  }

  function handleInputTopic(e) {
    const newTopic = e.target.value;
    setTopic(newTopic);

    if (newTopic.trim().length > 0) {
      setIsTopicMissing(false);
    } else {
      setIsTopicMissing(true);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      enterCouncil();
    }
  }

  function selectFood(foodName) {
    // Check if the foodName is already selected to prevent duplicates
    if (!selectedFoods.includes(foodName)) {
      const updatedSelectedFoods = [...selectedFoods, foodName];
      setSelectedFoods(updatedSelectedFoods);

      // Check if at least two foods are now selected
      if (updatedSelectedFoods.length >= 2) {
        setAreFoodsMissing(false);
      }

      console.log(`SELECTED ${foodName}`);
    }
  }

  function deselectFood(foodName) {
    // Filter out the foodName from the selectedFoods array to remove it
    const updatedSelectedFoods = selectedFoods.filter(
      (food) => food !== foodName
    );
    setSelectedFoods(updatedSelectedFoods);

    // If fewer than two foods remain selected, show the warning
    if (updatedSelectedFoods.length < 2) {
      setAreFoodsMissing(true);
    }

    console.log(`DESELECTED ${foodName}`);
  }

  return (
    <div style={welcomeStyle}>
      <div>
        <h4>
          Welcome to the Council of Foods - an assembly of diverse foods,
          <br />
          addressing the broken food system through debate.
        </h4>
        <h4>
          To begin a meeting, decide on a topic
          <br /> & pick which foods will be participating!
        </h4>
      </div>
      <div>
        <h3>Topic:</h3>
        <textarea
          className={`text-input ${isTopicMissing ? "input-error" : ""}`} // Apply error styling if topic is missing
          rows="2"
          cols="30"
          value={topic}
          onChange={handleInputTopic}
          onKeyDown={handleKeyDown}
        ></textarea>
        <h3 className={`${!isTopicMissing ? "hidden" : ""}`}>
          please enter a topic to proceed
        </h3>
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
        <h3 className={`${!areFoodsMissing ? "hidden" : ""}`}>
          please select at least two foods to proceed
        </h3>
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
