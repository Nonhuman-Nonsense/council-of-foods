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
      <div style={{ display: "flex", alignItems: "center" }}>
        <a href="https://nonhuman-nonsense.com"><img alt="Nonhuman Nonsense" src="/logos/logo_nonhuman_nonsense.webp" style={{ maxWidth: isMobile ? "80px" : "120px", height: isMobile ? "10" + dvh : "61px", minHeight: "30px", marginRight: "20px" }} /></a>
        <a href="https://vindelalvenbiosfar.se/"><img alt={t('biosphere')} src="/logos/logo_biosphere.webp" style={{ maxWidth: isMobile ? "80px" : "150px", height: isMobile ? "10" + dvh : "100px", minHeight: "30px" }} /></a>
      </div>
      <p>{t('contactText.1')}<a href="https://nonhuman-nonsense.com">Nonhuman&nbsp;Nonsense</a>{t('contactText.2')}<a href="https://vindelalvenbiosfar.se/">{t('biosphere')}</a>, <a href="https://www.gundegastrauberga.com/">Gundega&nbsp;Strauberga</a>, <a href="https://www.polymorf.se/">Albin&nbsp;Karlsson</a>{t('contactText.3')}</p>
      <p>
        <a href="https://www.instagram.com/nonhuman_nonsense/">@nonhuman_nonsense</a>
        <br />
        <a href="https://nonhuman-nonsense.com">nonhuman-nonsense.com</a>
        <br />
        <a href="mailto:hello@nonhuman-nonsense.com">hello@nonhuman-nonsense.com</a>
      </p>
      <p>{t('contactText.4')}Vinnova (<a href="https://www.vinnova.se/en/p/council-of-the-forest">ref. nr. 2025-00344</a>){t('contactText.5')}<a href="https://council-of-foods.com/">Council of Foods</a>{t('contactText.6')}<a href="https://cordis.europa.eu/project/id/101069990">Horizon&nbsp;Europe{t('contactText.7')} 101069990</a>.</p>
      <a href="https://www.vinnova.se/en/p/council-of-the-forest"><img alt={t('contactText.8')} src="/logos/logo_vinnova.webp" style={{ width: "95vw", maxWidth: "200px", height: isMobile ? "15vh" : "50px", minHeight: "45px" }} /></a>
    </div>
  );
}

export default Contact;
