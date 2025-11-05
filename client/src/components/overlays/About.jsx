import { Link } from "react-router-dom";
import { useMobile, usePortrait } from "../../utils";

function About() {

  const isMobile = useMobile();
  const isPortait = usePortrait();

  const wrapper = {
    width: isPortait ? "80vw" : "",
    maxWidth: isMobile ? "650px" : "650px",
  };

  return (
      <div style={wrapper}>
        <p>
        What would a biologically grown potato think about synthetic biology? How would a mass-produced banana respond to engineered resilience? And what does artificial intelligence have to say about its own role in the evolution of life?
        </p>
        <p>Welcome to the Council of Foods, a political arena where food speaks—not just of the broken food system, but of the expanding frontiers of biotechnology. Inspired by the legacy of Asilomar 1975, this AI-driven council gathers an array of edible entities to debate the past, present, and future of synthetic life.</p>
        <p>In 1975, a group of scientists convened at Asilomar to deliberate the risks of recombinant DNA. Fifty years later, the stakes have only grown. Life is no longer merely inherited; it is written, rewritten, and coded into existence. Who steers this ship? What are the limits? Who or what is excluded from the conversation?</p>
        <p>At the Council of Foods, AI embodies genetically modified, industrially farmed, and wild-foraged foods—each with distinct values and ethical positions. The discussions extend beyond agriculture, touching on issues of biological containment, synthetic genetics, and the geopolitics of bioeconomies.</p>
        <p>You, dear human, are invited to engage, challenge assumptions, and shape the discourse. The conversation culminates in a policy document—one that might echo the spirit of Asilomar or forge a path beyond it.</p>
        <p>Because in the age of synthetic biology, even a mushroom might demand a seat at the table.</p>
        <p>a project by<br/><Link to={{search: "o=contact"}}>Nonhuman Nonsense</Link></p>
      </div>
  );
}

export default About;
