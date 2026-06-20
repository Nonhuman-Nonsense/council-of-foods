import { useEffect, useState } from "react";
import { useMobile, useMobileXs } from "@/utils";
import { useTranslation } from "react-i18next";
import { getPushToTalk, setPushToTalk } from "@/settings/councilSettings";
import { useAppMode } from "@/museum/useAppMode";
import { useButtonStore } from "@stores/useButtonStore";
import { useButtonBridgeHealth } from "@/button/useBridgeHealth";

type ButtonUiStatus = "unsupported" | "bridgeNotRunning" | "connecting" | "connected" | "waiting" | "error";

function getButtonUiStatus(
  bridgeAvailable: boolean,
  bridgeHealth: ReturnType<typeof useButtonBridgeHealth>,
  bridgeStatus: ReturnType<typeof useButtonStore.getState>["bridgeStatus"],
): ButtonUiStatus {
  if (!bridgeAvailable) return "unsupported";
  if (bridgeHealth.status === "not_running" || bridgeHealth.status === "error") {
    return "bridgeNotRunning";
  }
  if (bridgeStatus === "connected") return "connected";
  if (bridgeStatus === "connecting") return "connecting";
  if (bridgeStatus === "error") return "error";
  if (bridgeHealth.status === "running") return "waiting";
  return "connecting";
}

function buttonStatusLabel(status: ButtonUiStatus, t: (key: string) => string): string {
  switch (status) {
    case "connected":
      return t("setup.button.connected");
    case "connecting":
      return t("setup.button.connecting");
    case "bridgeNotRunning":
      return t("setup.button.bridgeNotRunning");
    case "waiting":
      return t("setup.button.waiting");
    case "error":
      return t("setup.button.error");
    default:
      return t("setup.button.unsupported");
  }
}

/**
 * Setup Overlay
 *
 * Staff-only global council options at #setup.
 */
function Setup(): React.ReactElement {
  const isMobile = useMobile();
  const isMobileXs = useMobileXs();
  const { t } = useTranslation();
  const { mode: appMode, setAppMode } = useAppMode();
  const [pushToTalk, setPushToTalkState] = useState(getPushToTalk);
  const bridgeStatus = useButtonStore((state) => state.bridgeStatus);
  const bridgeError = useButtonStore((state) => state.bridgeError);
  const bridgeAvailable = useButtonStore((state) => state.bridgeAvailable);
  const setLedMode = useButtonStore((state) => state.setLedMode);
  const bridgeHealth = useButtonBridgeHealth(pushToTalk);
  const buttonStatus = getButtonUiStatus(bridgeAvailable, bridgeHealth, bridgeStatus);

  useEffect(() => {
    if (!pushToTalk || bridgeStatus !== "connected") return;
    void setLedMode("pulse");
  }, [pushToTalk, bridgeStatus, setLedMode]);

  const containerStyle: React.CSSProperties = {
    width: "96vw",
    height: "70%",
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

  const sectionStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
    alignItems: "center",
    width: "100%",
    marginTop: isMobile ? "20px" : "30px",
  };

  function selectAlwaysOn(): void {
    setPushToTalkState(false);
    setPushToTalk(false);
    void setLedMode("off");
  }

  function selectPushToTalk(): void {
    setPushToTalkState(true);
    setPushToTalk(true);
  }

  return (
    <div style={containerStyle}>
      <h1 style={{ marginBottom: isMobile ? (isMobileXs ? "0px" : "5px") : undefined }}>
        {t("setup.title")}
      </h1>

      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0 }}>{t("setup.mode")}</h3>

        <div style={gridContainerStyle}>
          <button
            type="button"
            data-testid="app-mode-web"
            className={appMode === "web" ? "selected " : ""}
            onClick={() => setAppMode("web")}
            style={selectButtonStyle}
          >
            {t("setup.web")}
          </button>
          <button
            type="button"
            data-testid="app-mode-museum"
            className={appMode === "museum" ? "selected " : ""}
            onClick={() => setAppMode("museum")}
            style={selectButtonStyle}
          >
            {t("setup.museum")}
          </button>
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0 }}>{t("setup.voiceGuide")}</h3>

        <div style={gridContainerStyle}>
          <button
            type="button"
            data-testid="voice-guide-always-on"
            className={!pushToTalk ? "selected " : ""}
            onClick={selectAlwaysOn}
            style={selectButtonStyle}
          >
            {t("setup.alwaysOn")}
          </button>
          <button
            type="button"
            data-testid="voice-guide-push-to-talk"
            className={pushToTalk ? "selected " : ""}
            onClick={selectPushToTalk}
            style={selectButtonStyle}
          >
            {t("setup.pushToTalk")}
          </button>
        </div>
      </div>

      {pushToTalk ? (
        <div style={sectionStyle}>
          <h3 style={{ marginTop: 0 }}>{t("setup.button.title")}</h3>
          <p data-testid="setup-button-status" style={{ marginTop: 0 }}>
            {t("setup.button.status")}: {buttonStatusLabel(buttonStatus, t)}
            {buttonStatus === "error" && bridgeError ? ` — ${bridgeError}` : ""}
          </p>
          {buttonStatus === "bridgeNotRunning" ? (
            <p
              data-testid="setup-button-hint"
              style={{ marginTop: 0, fontStyle: "italic", opacity: 0.8, textAlign: "center" }}
            >
              {t("setup.button.bridgeNotRunningHint")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default Setup;
