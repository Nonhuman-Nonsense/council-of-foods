import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import errorIcon from "@assets/error.png";
import AutoButton from "@/AutoButton";
import { useRouting } from "@/routing";
import { useCouncilSettings } from "@/settings/councilSettings";
import { reportTerminalError } from "@/logger";

const MUSEUM_AUTO_RESTART_SECONDS = 10;

export type UnrecoverableError = {
  message: string;
  source: string;
  cause?: unknown;
  meetingId?: number;
};

/** Pass a string for message-only errors (source defaults to `client`). */
export type SetUnrecoverableError = (error: UnrecoverableError | string | null) => void;

function normalizeUnrecoverableError(error: UnrecoverableError | string): UnrecoverableError {
  if (typeof error === "string") {
    return { message: error, source: "client" };
  }
  return error;
}

/**
 * App-level terminal error state. Reporting runs when the error is set (not in the overlay).
 */
export function useUnrecoverableError(): {
  unrecoverableError: UnrecoverableError | null;
  setUnrecoverableError: SetUnrecoverableError;
} {
  const [unrecoverableError, setErrorState] = useState<UnrecoverableError | null>(null);

  const setUnrecoverableError = useCallback<SetUnrecoverableError>((next) => {
    if (next === null) {
      setErrorState(null);
      return;
    }

    const normalized = normalizeUnrecoverableError(next);
    setErrorState(normalized);
    reportTerminalError(normalized.source, normalized.message, normalized.cause, {
      meetingId: normalized.meetingId,
    });
  }, []);

  return { unrecoverableError, setUnrecoverableError };
}

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
