import { useTranslation } from "react-i18next";
import errorIcon from "@assets/error.png?inline";
import AutoButton from "@/AutoButton";
import { HEALTH_RETRY_SECONDS, probeOriginHealth } from "@/health";
import { restartNow } from "@/navigation";
import { useCouncilSettings } from "@/settings/councilSettings";
import { connectionLostCopy, useOnline } from "./connectionCopy";
import type { UnrecoverableError } from "./errorStore";
import { errorCopy } from "./errorCopy";

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
  const { capabilities } = useCouncilSettings();
  const online = useOnline();
  // A server that stayed out of reach: say what to check rather than that something broke.
  const lost = error.connectionLost ? connectionLostCopy(online) : null;
  // Our own words for a named failure; the server's message only when we have
  // none — and never when the message is internal prose.
  const detail = errorCopy(t, error.errorKey, error.message).trim();
  const showGenericOnly =
    detail.length === 0 || error.technical === true || TECHNICAL_SOURCES.has(error.source);

  return (
    <div>
      <img alt="error" src={errorIcon} style={{ height: "80px", opacity: "0.7" }} />
      <h2>{lost ? t(lost.title) : t("error.title")}</h2>
      {lost ? (
        <p role="status" style={{ marginTop: "4px" }}>
          {t(lost.detail)}
        </p>
      ) : showGenericOnly ? (
        <p style={{ whiteSpace: "pre-line" }}>{t("error.message")}</p>
      ) : (
        <p role="status" style={{ marginTop: "4px" }}>
          {detail}
        </p>
      )}
      {capabilities.autoRestart ? (
        <AutoButton
          timeout={HEALTH_RETRY_SECONDS}
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
