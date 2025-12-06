import { useTranslation } from "react-i18next";
import { useMobile, dvh } from "../../utils";

function Contact() {

  const isMobile = useMobile();
  const { t } = useTranslation();

  const wrapper = {
    width: "80vw",
    maxWidth: isMobile ? "550px" : "450px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center"
  };

  return (
    <div style={wrapper}>
      <a href="https://nonhuman-nonsense.com"><img alt="Nonhuman Nonsense" src="/logos/nonhuman_nonsense_logo.png" style={{ maxWidth: isMobile ? "80px" : "120px", height: isMobile ? "10" + dvh : "61px", minHeight: "30px" }} /></a>
      <p>{t('contactText.1')}<a href="https://nonhuman-nonsense.com">Nonhuman&nbsp;Nonsense</a>{t('contactText.2')}<a href="https://studiootherspaces.net/">Studio&nbsp;Other&nbsp;Spaces</a>, <a href="https://www.in4art.eu/">In4Art</a>, <a href="https://elliott.computer/">Elliot&nbsp;Cost</a>, <a href="https://www.polymorf.se/">Albin&nbsp;Karlsson</a>, Lachlan Kenneally{t('contactText.3')}</p>
      <p>This special version is created for <a href="https://www.spiritofasilomar.org">The Spirit of Asilomar and the Future of Biotechnology</a> summit, 23-26 February 2025.</p>
      <p>
        <a href="https://www.instagram.com/nonhuman_nonsense/">@nonhuman_nonsense</a>
        <br />
        <a href="https://nonhuman-nonsense.com">nonhuman-nonsense.com</a>
        <br />
        <a href="mailto:hello@nonhuman-nonsense.com">hello@nonhuman-nonsense.com</a>
      </p>
      <p>{t('contactText.4')}<a href="https://starts.eu/hungryecocities/">The&nbsp;Hungry&nbsp;EcoCities&nbsp;project</a>{t('contactText.5')}<a href="https://starts.eu/">S+T+ARTS</a>{t('contactText.6')}<a href="https://cordis.europa.eu/project/id/101069990">Horizon&nbsp;Europe{t('contactText.7')} 101069990</a>.</p>
      <img alt="Funded by the EU, as part of S+T+ARTS" src="/logos/logos_eu-white-starts-white.webp" style={{ width: "95vw", maxWidth: isMobile ? "300px" : "450px", height: isMobile ? "15vh" : "84px", minHeight: "45px" }} />
    </div>
  );
}

export default Contact;
