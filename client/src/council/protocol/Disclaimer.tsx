import { useTranslation, Trans } from "react-i18next";
import { externalLinks } from "@/i18n/externalLinks";

function Disclaimer() {
  const { t } = useTranslation();

  return (
    <div>
      <p>{t("disclaimer.intro")}</p>
      <br />
      <ol>
        <li>{t("disclaimer.items.misinformation")}</li>
        <li>{t("disclaimer.items.notResearch")}</li>
        <li>{t("disclaimer.items.takeAction")}</li>
      </ol>
      <br />
      <p>
        <Trans i18nKey="disclaimer.attribution" components={externalLinks} />
      </p>
      <br />
      <p>{t("disclaimer.moreInfo")}</p>
      <br />
    </div>
  );
}

export default Disclaimer;
