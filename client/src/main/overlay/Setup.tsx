import { useEffect, type CSSProperties } from "react";
import { useMobile } from "@/utils";
import { useTranslation } from "react-i18next";
import {
  DEV_LOG_CATEGORIES,
  useCouncilSettings,
} from "@/settings/useCouncilSettings";
import {
  useButton,
  useButtonConnection,
  useButtonBridgeHealth,
} from "@/museum/button/useButton";
import {
  getBridgeAppStatus,
  getBridgeDaemonStatus,
  getSetupBridgeDetailLines,
  getSetupBridgeLogHint,
  getUsbButtonStatus,
} from "@/main/overlay/setupButtonStatus";
import { useButtonLedDebugOverlay } from "@/museum/button/buttonDebug";
import {
  SetupCollapsible,
  SetupPanel,
  SetupSegmented,
  SetupStatusChip,
} from "@/main/overlay/setup/SetupPanels";
import "./setup/setupControlPanel.css";

function statusTone(
  key: string,
): "ok" | "warn" | "error" | "idle" {
  if (key === "running" || key === "connected") return "ok";
  if (key === "checking" || key === "connecting") return "warn";
  if (key === "error" || key === "wrongDevice") return "error";
  return "idle";
}

/**
 * Staff-only global council options at #setup.
 */
function Setup(): React.ReactElement {
  const isMobile = useMobile();
  const { t } = useTranslation();
  const {
    mode: appMode,
    setAppMode,
    pushToTalkMode,
    setPushToTalkMode,
    devLogEnabled,
    setDevLogEnabled,
    devLogCategories,
    setDevLogCategoryEnabled,
    setAllDevLogCategories,
  } = useCouncilSettings();
  const bridgeButtonActive = appMode === "museum" && pushToTalkMode;
  const { bridgeStatus, bridgeError, bridgeAvailable } =
    useButtonConnection(bridgeButtonActive);
  const bridgeHealth = useButtonBridgeHealth(bridgeButtonActive);
  const { ledDebugOverlay, setLedDebugOverlay } = useButtonLedDebugOverlay();

  const button = useButton("setup");
  const { claim, release, setLed, pressed } = button;

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

  const selectButtonStyle: CSSProperties = {
    padding: isMobile ? "3px 0" : "6px 0",
    width: "100%",
  };

  const showButtonPanel = pushToTalkMode && appMode === "museum";
  const showDevPanel = import.meta.env.DEV;
  const showButtonDetails =
    showButtonPanel &&
    (bridgeDetailLines.length > 0 ||
      daemonStatus === "notRunning" ||
      (daemonStatus === "running" &&
        (usbStatus === "notDetected" || usbStatus === "wrongDevice")));

  return (
    <div className="setup-control-panel">
      <h1 className="setup-control-panel__title">{t("setup.title")}</h1>

      <div className="setup-control-panel__grid">
        <SetupPanel title={t("setup.panels.installation")}>
          <SetupSegmented>
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
          </SetupSegmented>
        </SetupPanel>

        <SetupPanel title={t("setup.panels.voiceGuide")}>
          <SetupSegmented>
            <button
              type="button"
              data-testid="voice-guide-always-on"
              className={!pushToTalkMode ? "selected " : ""}
              onClick={() => setPushToTalkMode(false)}
              style={selectButtonStyle}
            >
              {t("setup.alwaysOn")}
            </button>
            <button
              type="button"
              data-testid="voice-guide-push-to-talk"
              className={pushToTalkMode ? "selected " : ""}
              onClick={() => setPushToTalkMode(true)}
              style={selectButtonStyle}
            >
              {t("setup.pushToTalk")}
            </button>
          </SetupSegmented>
        </SetupPanel>

        {showButtonPanel ? (
          <SetupPanel title={t("setup.button.title")} fullWidth testId="setup-button-status">
            <div className="setup-status-row">
              <SetupStatusChip
                label={t("setup.button.bridgeLabel")}
                value={t(`setup.button.bridge.${daemonStatus}`)}
                tone={statusTone(daemonStatus)}
                testId="setup-bridge-daemon-status"
              />
              <SetupStatusChip
                label={t("setup.button.appLabel")}
                value={
                  appStatus === "error" && bridgeError
                    ? `${t(`setup.button.app.${appStatus}`)} — ${bridgeError}`
                    : t(`setup.button.app.${appStatus}`)
                }
                tone={statusTone(appStatus)}
                testId="setup-bridge-app-status"
              />
              <SetupStatusChip
                label={t("setup.button.usbLabel")}
                value={t(`setup.button.usb.${usbStatus}`)}
                tone={statusTone(usbStatus)}
                testId="setup-button-usb-status"
              />
            </div>

            {showButtonDetails ? (
              <SetupCollapsible
                label={t("setup.panels.details")}
                testId="setup-button-details"
              >
                {bridgeDetailLines.map((line) => (
                  <p key={line} data-testid="setup-bridge-detail-line">
                    {line}
                  </p>
                ))}
                {daemonStatus === "notRunning" ? (
                  <p data-testid="setup-button-hint" style={{ fontStyle: "italic" }}>
                    {t("setup.button.bridgeNotRunningHint", {
                      logPath: getSetupBridgeLogHint(),
                    })}
                  </p>
                ) : null}
                {daemonStatus === "running" && usbStatus === "notDetected" ? (
                  <p data-testid="setup-button-usb-hint" style={{ fontStyle: "italic" }}>
                    {t("setup.button.usbNotDetectedHint")}
                  </p>
                ) : null}
                {daemonStatus === "running" && usbStatus === "wrongDevice" ? (
                  <p
                    data-testid="setup-button-wrong-device-hint"
                    style={{ fontStyle: "italic" }}
                  >
                    {t("setup.button.usbWrongDeviceHint")}
                  </p>
                ) : null}
              </SetupCollapsible>
            ) : null}
          </SetupPanel>
        ) : null}

        {showDevPanel ? (
          <SetupPanel title={t("setup.panels.developer")} fullWidth testId="setup-developer-panel">
            <label className="setup-dev-log-master">
              <input
                type="checkbox"
                data-testid="setup-dev-log-enabled"
                checked={devLogEnabled}
                onChange={(event) => setDevLogEnabled(event.target.checked)}
              />
              {t("setup.devLog.enabled")}
            </label>

            <div className="setup-dev-log-actions">
              <button
                type="button"
                data-testid="setup-dev-log-all"
                onClick={() => setAllDevLogCategories(true)}
              >
                {t("setup.devLog.all")}
              </button>
              <button
                type="button"
                data-testid="setup-dev-log-none"
                onClick={() => setAllDevLogCategories(false)}
              >
                {t("setup.devLog.none")}
              </button>
            </div>

            <div className="setup-dev-log-categories">
              {DEV_LOG_CATEGORIES.map((category) => (
                <label key={category}>
                  <input
                    type="checkbox"
                    data-testid={`setup-dev-log-category-${category}`}
                    checked={devLogCategories[category]}
                    disabled={!devLogEnabled}
                    onChange={(event) =>
                      setDevLogCategoryEnabled(category, event.target.checked)
                    }
                  />
                  {t(`setup.devLog.categories.${category}`)}
                </label>
              ))}
            </div>

            <label className="setup-dev-log-master">
              <input
                type="checkbox"
                data-testid="setup-led-debug-toggle"
                checked={ledDebugOverlay}
                onChange={(event) => setLedDebugOverlay(event.target.checked)}
              />
              {t("setup.button.ledDebugOverlay")}
            </label>
          </SetupPanel>
        ) : null}
      </div>
    </div>
  );
}

export default Setup;
