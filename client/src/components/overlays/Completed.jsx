import { useTranslation } from "react-i18next";

function Completed({ onContinue, onWrapItUp, canExtendMeeting }) {

  const { t } = useTranslation();

  return (
    <div>
      <h2>{t('completed.title')}</h2>
      <div>
        <p>{t('completed.1')}<br />{t('completed.2')}<br /><br /></p>
        <button
          onClick={onWrapItUp}
          style={{ marginRight: "9px" }}
        >{t('completed.3')}</button>
        {canExtendMeeting && (
          <button
            onClick={onContinue}
            style={{ marginLeft: "9px" }}
          >{t('completed.4')}</button>
        )}
        <div style={{ height: "60px" }} />
      </div>
    </div>
  );
}

export default Completed;