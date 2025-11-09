import { useTranslation } from "react-i18next";

function CouncilError() {

  const { t } = useTranslation();

  return (
    <div>
      <img alt="error" src="/error.png" style={{ height: "80px", opacity: "0.7" }} />
      <h2>{t('error.title')}</h2>
      <p>{t('error.1')}</p>
      <a href="/"><button style={{ marginTop: "10px" }}>{t('restart')}</button></a>
    </div>
  );
}

export default CouncilError;
