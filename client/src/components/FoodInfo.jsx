import React from "react";

function FoodInfo({ foodName }) {
  return (
    <div>
      <h2>{foodName}</h2>
      <div>
        <h4 className="italic">H2O</h4>
        <h4 className="italic">variety: ground water</h4>
        <h4 className="italic">origin: Brussels</h4>
      </div>
      <h4>
        Lorem ipsum dolor, sit amet consectetur adipisicing elit.
        <br />
        Consequuntur laboriosam necessitatibus dolor nemo nihil similique
        <br />
        laudantium quisquam vitae esse animi!
      </h4>
    </div>
  );
}

export default FoodInfo;
