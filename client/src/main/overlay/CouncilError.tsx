import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import errorIcon from "@assets/error.png";
import AutoButton from "@/AutoButton";
import { useRouting } from "@/routing";
import { useCouncilSettings } from "@/settings/councilSettings";
import type { UnrecoverableError } from "./errorStore";

export type { UnrecoverableError, SetUnrecoverableError } from "./errorStore";

const MUSEUM_AUTO_RESTART_SECONDS = 10;

export interface CouncilErrorProps {
  error: UnrecoverableError;
}

/**
 * CouncilError Overlay
 *
 * Displayed when a critical non-recoverable error occurs (e.g., API failure).
 * Provides a button to refresh the application.
 */
function CouncilError({ error }: CouncilErrorProps): React.ReactElement {
  const { t } = useTranslation();
  const { rootPath } = useRouting();
  const { isMuseumMode } = useCouncilSettings();
  const detail = error.message.trim();
  const showGenericOnly = detail.length === 0;

  const restart = useCallback(() => {
    window.location.href = rootPath;
  }, [rootPath]);

  return (
    <div>
      <img alt="error" src={errorIcon} style={{ height: "80px", opacity: "0.7" }} />
      <h2>{t("error.title")}</h2>
      {showGenericOnly ? (
        <p>{t("error.message")}</p>
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
          {t("app.restart")}
        </AutoButton>
      ) : (
        <a href={rootPath}>
          <button type="button" style={{ marginTop: "10px" }}>
            {t("app.restart")}
          </button>
        </a>
      )}
    </div>
  );
}

export default CouncilError;
