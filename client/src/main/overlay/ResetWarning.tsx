import { useTranslation } from "react-i18next";

/**
 * ResetWarning Overlay
 * 
 * A confirmation dialog used when the user selects "Restart"
 * from the navigation menu or attempts a destructive action.
 * 
 * @param {Object} props
 * @param {string} [props.message] - Custom warning message (optional).
 * @param {Function} props.onReset - Callback to confirm reset.
 * @param {Function} props.onCancel - Callback to cancel reset.
 */
interface ResetWarningProps {
  message?: string;
  onReset: () => void;
  onCancel: () => void;
}

function ResetWarning({ message, onReset, onCancel }: ResetWarningProps): React.ReactElement {

  const { t } = useTranslation();

  return (
    <div>
      <h2>{t('reset.title')}</h2>
      <h4 style={{ maxWidth: "min(600px,80vw)", whiteSpace: 'pre-wrap' }}>
        {message ?? t('reset.default')}
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
