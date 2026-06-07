import { useState } from "react";
import { useMobile, useMobileXs } from "@/utils";
import { useTranslation } from "react-i18next";
import { getPushToTalk, setPushToTalk } from "@/settings/councilSettings";

/**
 * Setup Overlay
 *
 * Global council options persisted in localStorage.
 */
function Setup(): React.ReactElement {
  const isMobile = useMobile();
  const isMobileXs = useMobileXs();
  const { t } = useTranslation();
  const [pushToTalk, setPushToTalkState] = useState(getPushToTalk);

  const containerStyle: React.CSSProperties = {
    width: "96vw",
    maxWidth: "850px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    alignItems: "center",
  };

  const gridContainerStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    width: "100%",
    columnGap: "14px",
    rowGap: isMobile ? "3px" : "15px",
    justifyItems: "center",
  };

  const selectButtonStyle: React.CSSProperties = {
    padding: isMobile ? "3px 0" : "6px 0",
    width: "100%",
  };

  function selectAlwaysOn(): void {
    setPushToTalkState(false);
    setPushToTalk(false);
  }

  function selectPushToTalk(): void {
    setPushToTalkState(true);
    setPushToTalk(true);
  }

  return (
    <div style={containerStyle}>
      <h1 style={{ marginBottom: isMobile ? (isMobileXs ? "0px" : "5px") : undefined }}>
        {t("setupTitle")}
      </h1>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-start",
          alignItems: "center",
          width: "100%",
        }}
      >
        <h3 style={{ marginTop: 0 }}>{t("voiceGuide")}</h3>

        <div style={gridContainerStyle}>
          <button
            type="button"
            data-testid="voice-guide-always-on"
            className={!pushToTalk ? "selected " : ""}
            onClick={selectAlwaysOn}
            style={selectButtonStyle}
          >
            {t("alwaysOn")}
          </button>
          <button
            type="button"
            data-testid="voice-guide-push-to-talk"
            className={pushToTalk ? "selected " : ""}
            onClick={selectPushToTalk}
            style={selectButtonStyle}
          >
            {t("pushToTalk")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Setup;
