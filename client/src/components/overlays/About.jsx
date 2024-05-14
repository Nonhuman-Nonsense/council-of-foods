import React from "react";

function About() {

  const wrapper = {
    maxWidth: "450px",
  };

  return (
      <div style={wrapper}>
        <p>
        Welcome to the Council of Foods!<br/>
        A political arena for foods to discuss the broken food system. Here, you, as a human participant, can listen, engage, and contribute to the discussions. The foods are prompted on different knowledges and ethical guidelines using the AI Language model GPT from Open AI.
        </p>
        <p>
        Our council members represent a diverse spectrum of food origins and ethical viewpoints, including mass-produced, locally grown, genetically modified, processed, fair trade, affordable, and organic foods. Each member brings their own unique eco-social impacts and ethical guidelines to the table, informed by their distinct backgrounds. Join the discussion on what actions need to be taken to form a locally and globally sustainable food system!
        </p>
      </div>
  );
}

export default About;
