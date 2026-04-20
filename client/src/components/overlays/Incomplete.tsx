import { useTranslation } from "react-i18next";

/**
 * Incomplete Overlay
 * 
 * Displayed in replay state if reaching a meeting_incomplete point
 * Allows the user to continue the half-finished meeting
 * 
 * @param {Object} props
 * @param {Function} props.onAttemptResume - Handler to attempt to resume the meeting.
 */
interface IncompleteProps {
  onAttemptResume: () => void;
  onNevermind: () => void;
}

function Incomplete({ onAttemptResume, onNevermind }: IncompleteProps): React.ReactElement {

  const { t } = useTranslation();

  return (
    <div>
      <h2>{t('incomplete.title')}</h2>
      <div>
        <p>{t('incomplete.1')}<br />{t('incomplete.2')}<br /><br /></p>
        <button
          onClick={onAttemptResume}
          style={{ marginRight: "9px" }}
        >{t('incomplete.3')}</button>
        <button
          onClick={onNevermind}
          style={{ marginLeft: "9px" }}
        >{t('incomplete.4')}</button>
        <div style={{ height: "60px" }} />
      </div>
    </div>
  );
}

export default Incomplete;