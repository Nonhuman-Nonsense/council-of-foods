import React from "react";
import { useMobile, dvh } from "../../utils";

function Contact() {

  const isMobile = useMobile();

  const wrapper = {
    width: "80vw",
    maxWidth: isMobile ? "550px" : "450px",
    display: "flex",
    flexDirection:"column",
    alignItems: "center"
  };

  return (
    <div style={wrapper}>
      <a href="https://nonhuman-nonsense.com"><img alt="Nonhuman Nonsense" src="/logos/nonhuman_nonsense_logo.png" style={{maxWidth: isMobile ? "80px" :"120px", height: isMobile ? "10" + dvh :"61px", minHeight: "30px"}} /></a>
      <p>
        The project is an initiative by art & design collective <a href="https://nonhuman-nonsense.com">Nonhuman&nbsp;Nonsense</a> developed in collaboration with <a href="https://studiootherspaces.net/">Studio&nbsp;Other&nbsp;Spaces</a>, <a href="https://www.in4art.eu/">In4Art</a>, <a href="https://elliott.computer/">Elliot&nbsp;Cost</a>, <a href="https://www.polymorf.se/">Albin&nbsp;Karlsson</a>, Lachlan Kenneally and others.
      </p>
      <p>
        <a href="https://www.instagram.com/nonhuman_nonsense/">@nonhuman_nonsense</a>
        <br />
        <a href="https://nonhuman-nonsense.com">nonhuman-nonsense.com</a>
        <br />
        <a href="mailto:hello@nonhuman-nonsense.com">hello@nonhuman-nonsense.com</a>
      </p>
      <p>
      Council of Forest is part of <a href="https://starts.eu/hungryecocities/">The&nbsp;Hungry&nbsp;EcoCities&nbsp;project</a>, part of the <a href="https://starts.eu/">S+T+ARTS</a> programme, and has received funding from the European&nbsp;Union’s <a href="https://cordis.europa.eu/project/id/101069990">Horizon&nbsp;Europe research and innovation programme under grant agreement 101069990</a>.
      </p>
      <img alt="Funded by the EU, as part of S+T+ARTS" src="/logos/logos_eu-white-starts-white.webp" style={{width: "95vw", maxWidth: isMobile ? "300px" : "450px", height: isMobile ? "15vh" :"84px", minHeight: "45px"}} />
    </div>
  );
}

export default Contact;
