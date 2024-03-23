import React from "react";

function Council({ options }) {
  const { name, topic, foods } = options;

  return (
    <div>
      <h1>Welcome to the council {name}</h1>
      <h1>Topic: {topic}</h1>
      <h1>Foods: {foods.join(", ")}</h1>
    </div>
  );
}

export default Council;
