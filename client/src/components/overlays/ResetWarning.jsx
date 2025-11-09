import { useTranslation } from "react-i18next";
import { capitalizeFirstLetter } from "../../utils";

function ResetWarning({ message, onReset, onCancel }) {

  const { t } = useTranslation();
  return (
    <div>
      <h2>{t('reset.title')}</h2>
      <h4>
        {message ? capitalizeFirstLetter(message) : t('reset.0')} {t('reset.1')}
      </h4>
      <div>
        <button
          onClick={onReset}
          style={{ marginRight: "9px" }}
        >{t('restart')}</button>
        <button
          onClick={onCancel}
          style={{ marginLeft: "9px" }}
        >{t('cancel')}</button>
      </div>
    </div>
  );
}

export default ResetWarning;
