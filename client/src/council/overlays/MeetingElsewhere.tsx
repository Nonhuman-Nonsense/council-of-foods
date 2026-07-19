import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useRouting } from "@/navigation";

/**
 * MeetingElsewhere Overlay
 *
 * Displayed in replay state when the meeting is incomplete and currently
 * claimed by a live session elsewhere (see hasLiveSession on the server).
 *
 * @param {Object} props
 * @param {Function} props.onGoBack - Handler to close the overlay.
 */
interface MeetingElsewhereProps {
  onGoBack: () => void;
}

function MeetingElsewhere({ onGoBack }: MeetingElsewhereProps): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { rootPath } = useRouting();

  return (
    <div>
      <h2>{t("meetingElsewhere.title")}</h2>
      <div>
        <p style={{ whiteSpace: "pre-wrap" }}>{t("meetingElsewhere.body")}</p>
        <button onClick={onGoBack} style={{ marginRight: "9px" }}>
          {t("meetingElsewhere.goBack")}
        </button>
        <button onClick={() => navigate(rootPath)} style={{ marginLeft: "9px" }}>
          {t("meetingElsewhere.startNew")}
        </button>
        <div style={{ height: "60px" }} />
      </div>
    </div>
  );
}

export default MeetingElsewhere;
