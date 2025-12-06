import { Link } from "react-router";
import { useMobile, usePortrait } from "../../utils";
import { useTranslation } from 'react-i18next';

function About() {

  const isMobile = useMobile();
  const isPortait = usePortrait();
  const { t } = useTranslation();

  const wrapper = {
    width: isPortait ? "80vw" : "",
    maxWidth: isMobile ? "650px" : "650px",
  };

  return (
    <div style={wrapper}>
      <p style={{whiteSpace: 'pre-wrap'}}>{t('aboutText.about')}</p>
      <p>{t('aboutText.link')}<br /><Link to={{ hash: "contact" }}>Nonhuman Nonsense</Link></p>
    </div>
  );
}

export default About;
