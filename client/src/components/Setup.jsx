import React from "react";
import FoodButton from "./FoodButton";

function Setup() {
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
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      enterCouncil();
    }
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
        ></textarea>
      </div>
      <div>
        <h3>Foods:</h3>
        <div className="food-buttons">
          {foods.map((food) => (
            <FoodButton
              key={food}
              name={food}
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
