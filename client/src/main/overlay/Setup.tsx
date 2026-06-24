import { useEffect } from "react";
import { useMobile, useMobileXs } from "@/utils";
import { useTranslation } from "react-i18next";
import { useCouncilSettings } from "@/settings/useCouncilSettings";
import { useButton, useButtonConnection } from "@/museum/button/hooks";
import {
  getBridgeAppStatus,
  getBridgeDaemonStatus,
  getSetupBridgeDetailLines,
  getSetupBridgeLogHint,
  getUsbButtonStatus,
} from "@/museum/button/setupButtonStatus";
import { useButtonBridgeHealth } from "@/museum/button/useBridgeHealth";
import { useButtonLedDebugOverlay } from "@/museum/button/useButtonLedDebugOverlay";

/**
 * Setup Overlay
 *
 * Staff-only global council options at #setup.
 */
function Setup(): React.ReactElement {
  const isMobile = useMobile();
  const isMobileXs = useMobileXs();
  const { t } = useTranslation();
  const { mode: appMode, setAppMode, pushToTalkMode, setPushToTalkMode } = useCouncilSettings();
  const bridgeButtonActive = appMode === "museum" && pushToTalkMode;
  const { bridgeStatus, bridgeError, bridgeAvailable } =
    useButtonConnection(bridgeButtonActive);
  const bridgeHealth = useButtonBridgeHealth(bridgeButtonActive);
  const { ledDebugOverlay, setLedDebugOverlay } = useButtonLedDebugOverlay();

  const button = useButton("setup");
  const { claim, release, setLed, pressed } = button;

  // Staff debug page: always hold the button claim; pulse normally, on while pressed.
  useEffect(() => {
    claim();
    return () => release();
  }, [claim, release]);

  useEffect(() => {
    setLed(pressed ? "on" : "pulse");
  }, [setLed, pressed]);

  const daemonStatus = getBridgeDaemonStatus(bridgeHealth);
  const appStatus = getBridgeAppStatus(bridgeAvailable, bridgeHealth, bridgeStatus);
  const usbStatus = getUsbButtonStatus(bridgeHealth);
  const bridgeDetailLines =
    bridgeHealth.status === "running" ? getSetupBridgeDetailLines(bridgeHealth) : [];

  const containerStyle: React.CSSProperties = {
    width: "96vw",
    minHeight: "70%",
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

  const statusLineStyle: React.CSSProperties = {
    margin: "0.15em 0",
    textAlign: "center",
  };

  function selectAlwaysOn(): void {
    setPushToTalkMode(false);
  }

  function selectPushToTalk(): void {
    setPushToTalkMode(true);
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
            className={!pushToTalkMode ? "selected " : ""}
            onClick={selectAlwaysOn}
            style={selectButtonStyle}
          >
            {t("setup.alwaysOn")}
          </button>
          <button
            type="button"
            data-testid="voice-guide-push-to-talk"
            className={pushToTalkMode ? "selected " : ""}
            onClick={selectPushToTalk}
            style={selectButtonStyle}
          >
            {t("setup.pushToTalk")}
          </button>
        </div>
      </div>

      {pushToTalkMode && appMode === "museum" ? (
        <div style={sectionStyle}>
          <h3 style={{ marginTop: 0 }}>{t("setup.button.title")}</h3>
          <div data-testid="setup-button-status">
            <p data-testid="setup-bridge-daemon-status" style={statusLineStyle}>
              {t("setup.button.bridgeLabel")}: {t(`setup.button.bridge.${daemonStatus}`)}
            </p>
            <p data-testid="setup-bridge-app-status" style={statusLineStyle}>
              {t("setup.button.appLabel")}: {t(`setup.button.app.${appStatus}`)}
              {appStatus === "error" && bridgeError ? ` — ${bridgeError}` : ""}
            </p>
            <p data-testid="setup-button-usb-status" style={statusLineStyle}>
              {t("setup.button.usbLabel")}: {t(`setup.button.usb.${usbStatus}`)}
            </p>
            {bridgeDetailLines.map((line) => (
              <p
                key={line}
                data-testid="setup-bridge-detail-line"
                style={{ ...statusLineStyle, fontSize: "0.92em", opacity: 0.88 }}
              >
                {line}
              </p>
            ))}
          </div>
          {daemonStatus === "notRunning" ? (
            <p
              data-testid="setup-button-hint"
              style={{ marginTop: 0, fontStyle: "italic", opacity: 0.8, textAlign: "center" }}
            >
              {t("setup.button.bridgeNotRunningHint", { logPath: getSetupBridgeLogHint() })}
            </p>
          ) : null}
          {daemonStatus === "running" && usbStatus === "notDetected" ? (
            <p
              data-testid="setup-button-usb-hint"
              style={{ marginTop: 0, fontStyle: "italic", opacity: 0.8, textAlign: "center" }}
            >
              {t("setup.button.usbNotDetectedHint")}
            </p>
          ) : null}
          {daemonStatus === "running" && usbStatus === "wrongDevice" ? (
            <p
              data-testid="setup-button-wrong-device-hint"
              style={{ marginTop: 0, fontStyle: "italic", opacity: 0.8, textAlign: "center" }}
            >
              {t("setup.button.usbWrongDeviceHint")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0 }}>{t("setup.button.debugTitle")}</h3>
        <button
          type="button"
          data-testid="setup-led-debug-toggle"
          className={ledDebugOverlay ? "selected " : ""}
          onClick={() => setLedDebugOverlay(!ledDebugOverlay)}
          style={{ ...selectButtonStyle, maxWidth: 360 }}
        >
          {t("setup.button.ledDebugOverlay")}
        </button>
      </div>
    </div>
  );
}

export default Setup;
