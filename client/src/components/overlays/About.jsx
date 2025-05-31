import React from "react";
import { Link } from "react-router-dom";
import { useMobile, usePortrait } from "../../utils";

function About() {

  const isMobile = useMobile();
  const isPortait = usePortrait();

  const wrapper = {
    width: isPortait ? "80vw" : "",
    maxWidth: isMobile ? "550px" : "450px",
  };

  return (
    <div style={wrapper}>
      <p>
        What would an ancient pine say about deforestation? How would fishes react to a hydropower plant? Can AI embody the wisdom of a river, a tree, or a reindeer herd?
      </p>
      <p>
        Through AI, nonhuman entities—trees, fungi, rivers, and animals—gather to deliberate the fate of their shared home. Their voices are shaped by a mix of knowledge systems, including traditional and Indigenous worldviews, ecological science, and data. They are drawn from interviews and conversations with people living in and caring for the Vindelälven-Juhttátahkka biosphere reserve—reindeer herders, forest owners, rewilding organizations, pollinator experts, and cultural workers—each with a deep connection to the land.
      </p>
      <p>
        Council of Forest functions as an forum where the forest’s inhabitants voice their needs and consider the impact of human activities like logging, rewilding, and climate shifts. Humans are invited to listen, ask questions, and reflect. Each session concludes with a collective statement and a policy recommendation made by the forest. An experiment in ecological thinking and speculative design—exploring how technology can mediate between humans and the more-than-human world.
      </p>
      <p>
        What does it mean to act in the forest’s best interest? Whose knowledge counts? And what happens when we take nonhuman voices seriously?
      </p>
      <p>a project by<br /><Link to={{ search: "o=contact" }}>Nonhuman Nonsense</Link></p>
    </div>
  );
}

export default About;
