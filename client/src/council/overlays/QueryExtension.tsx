import { useTranslation } from "react-i18next";

interface QueryExtensionProps {
  onExtendMeeting: () => void;
  onConcludeMeeting: () => void;
}

function QueryExtension({ onExtendMeeting, onConcludeMeeting }: QueryExtensionProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <div>
      <h2>{t("queryExtension.title")}</h2>
      <div>
        <p style={{ whiteSpace: "pre-wrap" }}>{t("queryExtension.body")}</p>
        <button onClick={onConcludeMeeting} style={{ marginRight: "9px" }}>
          {t("queryExtension.conclude")}
        </button>
        <button onClick={onExtendMeeting} style={{ marginLeft: "9px" }}>
          {t("queryExtension.continue")}
        </button>
        <div style={{ height: "60px" }} />
      </div>
    </div>
  );
}

export default QueryExtension;
