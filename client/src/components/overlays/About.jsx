import { Link } from "react-router-dom";
import { useMobile, usePortrait } from "../../utils";
import { useTranslation } from 'react-i18next';

function About() {

  const isMobile = useMobile();
  const isPortait = usePortrait();
  const { t } = useTranslation();

  const wrapper = {
    width: isPortait ? "80vw" : "",
    maxWidth: isMobile ? "600px" : "550px",
  };

  return (
    <div style={wrapper}>
      <p>{t('aboutText.1')}</p>
      <p>{t('aboutText.2')}</p>
      <p>{t('aboutText.3')}</p>
      <p>{t('aboutText.4')}</p>
      <p>a project by<br /><Link to={{ search: "o=contact" }}>Nonhuman Nonsense</Link></p>
    </div>
  );
}

export default About;
