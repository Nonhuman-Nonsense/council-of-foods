import { useTranslation } from "react-i18next";

/**
 * Completed Overlay
 * 
 * Displayed when the meeting reaches its maximum length (or is manually ended).
 * Offers options to "Wrap it up" (finalize/summary) or "Extend Meeting" (add more messages).
 * 
 * @param {Object} props
 * @param {Function} props.onContinue - Handler to extend the meeting.
 * @param {Function} props.onWrapItUp - Handler to trigger the summary phase.
 * @param {boolean} props.canExtendMeeting - Whether the extend option is available.
 */
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