import { useTranslation } from "react-i18next";

interface QueryExtensionProps {
  onExtendMeeting: () => void;
  onConcludeMeeting: () => void;
}

function QueryExtension({ onExtendMeeting, onConcludeMeeting }: QueryExtensionProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <div>
      <h2>{t('queryExtension.title')}</h2>
      <div>
        <p>{t('queryExtension.1')}<br />{t('queryExtension.2')}<br /><br /></p>
        <button
          onClick={onConcludeMeeting}
          style={{ marginRight: "9px" }}
        >{t('queryExtension.3')}</button>
        <button
          onClick={onExtendMeeting}
          style={{ marginLeft: "9px" }}
        >{t('queryExtension.4')}</button>
        <div style={{ height: "60px" }} />
      </div>
    </div>
  );
}

export default QueryExtension;
