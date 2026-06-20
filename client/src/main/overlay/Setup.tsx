import { useEffect, useState } from "react";
import { useMobile, useMobileXs } from "@/utils";
import { useTranslation } from "react-i18next";
import { getPushToTalk, setPushToTalk } from "@/settings/councilSettings";
import { useAppMode } from "@/museum/useAppMode";
import { usePushToTalkStore } from "@stores/usePushToTalkStore";
import { useBridgeHealth } from "@/ptt/useBridgeHealth";

type TalkButtonUiStatus = "unsupported" | "bridgeNotRunning" | "connecting" | "connected" | "waiting" | "error";

function getTalkButtonUiStatus(
  bridgeAvailable: boolean,
  bridgeHealth: ReturnType<typeof useBridgeHealth>,
  bridgeStatus: ReturnType<typeof usePushToTalkStore.getState>["bridgeStatus"],
): TalkButtonUiStatus {
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

function talkButtonStatusLabel(status: TalkButtonUiStatus, t: (key: string) => string): string {
  switch (status) {
    case "connected":
      return t("setup.talkButton.connected");
    case "connecting":
      return t("setup.talkButton.connecting");
    case "bridgeNotRunning":
      return t("setup.talkButton.bridgeNotRunning");
    case "waiting":
      return t("setup.talkButton.waiting");
    case "error":
      return t("setup.talkButton.error");
    default:
      return t("setup.talkButton.unsupported");
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
  const bridgeStatus = usePushToTalkStore((state) => state.bridgeStatus);
  const bridgeError = usePushToTalkStore((state) => state.bridgeError);
  const bridgeAvailable = usePushToTalkStore((state) => state.bridgeAvailable);
  const setLedMode = usePushToTalkStore((state) => state.setLedMode);
  const bridgeHealth = useBridgeHealth(pushToTalk);
  const talkButtonStatus = getTalkButtonUiStatus(bridgeAvailable, bridgeHealth, bridgeStatus);

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
          <h3 style={{ marginTop: 0 }}>{t("setup.talkButton.title")}</h3>
          <p data-testid="setup-talk-button-status" style={{ marginTop: 0 }}>
            {t("setup.talkButton.status")}: {talkButtonStatusLabel(talkButtonStatus, t)}
            {talkButtonStatus === "error" && bridgeError ? ` — ${bridgeError}` : ""}
          </p>
          {talkButtonStatus === "bridgeNotRunning" ? (
            <p
              data-testid="setup-talk-button-hint"
              style={{ marginTop: 0, fontStyle: "italic", opacity: 0.8, textAlign: "center" }}
            >
              {t("setup.talkButton.bridgeNotRunningHint")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default Setup;
