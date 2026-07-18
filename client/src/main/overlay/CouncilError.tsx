import { useTranslation } from "react-i18next";
import errorIcon from "@assets/error.png?inline";
import AutoButton from "@/AutoButton";
import {
  MUSEUM_HEALTH_RETRY_SECONDS,
  probeOriginHealth,
  restartNow,
} from "@/navigation";
import { useCouncilSettings } from "@/settings/councilSettings";
import type { UnrecoverableError } from "./errorStore";

export type { UnrecoverableError, SetUnrecoverableError } from "./errorStore";

export interface CouncilErrorProps {
  error: UnrecoverableError;
}

/**
 * CouncilError Overlay
 *
 * Displayed when a critical non-recoverable error occurs (e.g., API failure).
 * Provides a button to refresh the application.
 */
// Sources whose raw error.message is an internal/technical string (e.g. a minified
// JS TypeError), never fit for display — always show the generic fallback instead.
const TECHNICAL_SOURCES = new Set(["react-error-boundary"]);

function CouncilError({ error }: CouncilErrorProps): React.ReactElement {
  const { t } = useTranslation();
  const { isMuseumMode } = useCouncilSettings();
  const detail = error.message.trim();
  const showGenericOnly = detail.length === 0 || TECHNICAL_SOURCES.has(error.source);

  return (
    <div>
      <img alt="error" src={errorIcon} style={{ height: "80px", opacity: "0.7" }} />
      <h2>{t("error.title")}</h2>
      {showGenericOnly ? (
        <p style={{ whiteSpace: "pre-line" }}>{t("error.message")}</p>
      ) : (
        <p role="status" style={{ marginTop: "4px" }}>
          {detail}
        </p>
      )}
      {isMuseumMode ? (
        <AutoButton
          timeout={MUSEUM_HEALTH_RETRY_SECONDS}
          guardAction={probeOriginHealth}
          guardRetryMessage={t("error.restartUnavailableRetrying")}
          action={restartNow}
          style={{ marginTop: "10px" }}
        >
          {t("app.restart")}
        </AutoButton>
      ) : (
        <button
          type="button"
          style={{ marginTop: "10px" }}
          onClick={restartNow}
        >
          {t("app.restart")}
        </button>
      )}
    </div>
  );
}

export default CouncilError;
