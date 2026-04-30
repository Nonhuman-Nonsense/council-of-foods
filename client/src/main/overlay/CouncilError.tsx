import { useTranslation } from "react-i18next";
import errorIcon from "@assets/error.png";

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
  const detail = detailMessage.trim();
  const showGenericOnly = detail.length === 0;

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
      <a href="/">
        <button type="button" style={{ marginTop: "10px" }}>
          {t("restart")}
        </button>
      </a>
    </div>
  );
}

export default CouncilError;
