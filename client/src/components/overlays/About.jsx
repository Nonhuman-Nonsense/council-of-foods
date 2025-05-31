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
        What would a biologically grown potato think about pesticides? How would a mass-produced banana respond? And what would you add to the discussion? Can AI identify as a rare mushroom? Could it help give a voice to the "voiceless" in decision-making?
        </p>
        <p>
        Welcome to the Council of Forest! A political arena where the foods themselves discuss the broken food system - through artificial intelligence.
        </p>
        <p>
        In the Council of Forest, AI language models are prompted to speak as a diversity of foods, embodying distinct values and ethical positions shaped in collaboration with food system experts. Each discussion is unique and not limited to the food system alone—broader societal issues emerge through the voices of industrially farmed, genetically modified, and wild-foraged foods. You, dear human, are invited to engage, challenge assumptions, and influence the conversation, which culminates in a policy recommendation document.
        </p>
        <p>a project by<br/><Link to={{search: "o=contact"}}>Nonhuman Nonsense</Link></p>
      </div>
  );
}

export default About;
