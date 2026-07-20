import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { useRouting } from "@/navigation";

/**
 * Incomplete Overlay
 *
 * Displayed in replay state on reaching a `meeting_incomplete` point. Normally offers to
 * resume the half-finished meeting; when `elsewhere` is set (another live session currently
 * holds it — see `hasLiveSession` on the server) resuming isn't possible, so it offers to go
 * back or start a new meeting instead (previously the separate `MeetingElsewhere` overlay).
 */
interface IncompleteProps {
  elsewhere?: boolean;
  onAttemptResume: () => void;
  onNevermind: () => void;
}

function Incomplete({ elsewhere = false, onAttemptResume, onNevermind }: IncompleteProps): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { rootPath } = useRouting();

  if (elsewhere) {
    return (
      <div>
        <h2>{t("meetingElsewhere.title")}</h2>
        <div>
          <p style={{ whiteSpace: "pre-wrap" }}>{t("meetingElsewhere.body")}</p>
          <button onClick={onNevermind} style={{ marginRight: "9px" }}>
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

  return (
    <div>
      <h2>{t("incomplete.title")}</h2>
      <div>
        <p style={{ whiteSpace: "pre-wrap" }}>{t("incomplete.body")}</p>
        <button onClick={onAttemptResume} style={{ marginRight: "9px" }}>
          {t("incomplete.resume")}
        </button>
        <button onClick={onNevermind} style={{ marginLeft: "9px" }}>
          {t("incomplete.nevermind")}
        </button>
        <div style={{ height: "60px" }} />
      </div>
    </div>
  );
}

export default Incomplete;
