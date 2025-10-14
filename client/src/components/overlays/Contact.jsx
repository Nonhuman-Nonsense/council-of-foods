import { useMobile, dvh } from "../../utils";

function Contact() {

  const isMobile = useMobile();

  const wrapper = {
    width: "80vw",
    maxWidth: isMobile ? "550px" : "450px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center"
  };

  return (
    <div style={wrapper}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <a href="https://nonhuman-nonsense.com"><img alt="Nonhuman Nonsense" src="/logos/logo_nonhuman_nonsense.webp" style={{ maxWidth: isMobile ? "80px" : "120px", height: isMobile ? "10" + dvh : "61px", minHeight: "30px", marginRight: "20px" }} /></a>
        <a href="https://vindelalvenbiosfar.se/"><img alt="Biosphere Area Vindelälven-Juhttátahkka" src="/logos/logo_biosphere.webp" style={{ maxWidth: isMobile ? "80px" : "150px", height: isMobile ? "10" + dvh : "100px", minHeight: "30px" }} /></a>
      </div>
      <p>
        The project is an initiative by art & design collective <a href="https://nonhuman-nonsense.com">Nonhuman&nbsp;Nonsense</a> developed in collaboration with <a href="https://vindelalvenbiosfar.se/">Biosphere&nbsp;Area&nbsp;Vindelälven-Juhttátahkka</a>, <a href="https://www.gundegastrauberga.com/">Gundega&nbsp;Strauberga</a>, <a href="https://www.polymorf.se/">Albin&nbsp;Karlsson</a>, and others.
      </p>
      <p>
        <a href="https://www.instagram.com/nonhuman_nonsense/">@nonhuman_nonsense</a>
        <br />
        <a href="https://nonhuman-nonsense.com">nonhuman-nonsense.com</a>
        <br />
        <a href="mailto:hello@nonhuman-nonsense.com">hello@nonhuman-nonsense.com</a>
      </p>
      <p>
        Council of Forest is funded by Vinnova (<a href="https://www.vinnova.se/en/p/council-of-the-forest">ref. nr. 2025-00344</a>) and is a continuation of the project <a href="https://council-of-foods.com/">Council of Foods</a> which has received funding from the European&nbsp;Union’s <a href="https://cordis.europa.eu/project/id/101069990">Horizon&nbsp;Europe research and innovation programme under grant agreement 101069990</a>.
      </p>
      <a href="https://www.vinnova.se/en/p/council-of-the-forest"><img alt="Funded by the EU, as part of S+T+ARTS" src="/logos/logo_vinnova.webp" style={{ width: "95vw", maxWidth: "200px", height: isMobile ? "15vh" : "50px", minHeight: "45px" }} /></a>
    </div>
  );
}

export default Contact;
