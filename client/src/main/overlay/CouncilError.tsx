import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import errorIcon from "@assets/error.png";
import AutoButton from "@/AutoButton";
import { useRouting } from "@/routing";
import { useCouncilSettings } from "@/settings/useCouncilSettings";

const MUSEUM_AUTO_RESTART_SECONDS = 10;

export interface CouncilErrorProps {
  /** Server-provided or client-safe explanation (API `{ message }`, socket `conversation_error`, etc.). When empty, the generic copy is shown instead. */
  detailMessage: string;
}

/**
 * CouncilError Overlay
 *
 * Displayed when a critical non-recoverable error occurs (e.g., API failure).
 * Provides a button to refresh the application.
 */
function CouncilError({ detailMessage }: CouncilErrorProps): React.ReactElement {
  const { t } = useTranslation();
  const { rootPath } = useRouting();
  const { isMuseumMode } = useCouncilSettings();
  const detail = detailMessage.trim();
  const showGenericOnly = detail.length === 0;

  const restart = useCallback(() => {
    window.location.href = rootPath;
  }, [rootPath]);

  return (
    <div>
      <img alt="error" src={errorIcon} style={{ height: "80px", opacity: "0.7" }} />
      <h2>{t("error.title")}</h2>
      {showGenericOnly ? (
        <p>{t("error.1")}</p>
      ) : (
        <p role="status" style={{ marginTop: "4px" }}>
          {detail}
        </p>
      )}
      {isMuseumMode ? (
        <AutoButton
          timeout={MUSEUM_AUTO_RESTART_SECONDS}
          action={restart}
          style={{ marginTop: "10px" }}
        >
          {t("restart")}
        </AutoButton>
      ) : (
        <a href={rootPath}>
          <button type="button" style={{ marginTop: "10px" }}>
            {t("restart")}
          </button>
        </a>
      )}
    </div>
  );
}

export default CouncilError;
