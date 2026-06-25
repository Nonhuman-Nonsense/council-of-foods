import { useEffect, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { useMobile } from "@/utils";
import { useTranslation } from "react-i18next";
import {
  DEV_LOG_CATEGORIES,
  useCouncilSettings,
} from "@/settings/councilSettings";
import {
  useButton,
  useButtonConnection,
  useButtonBridgeHealth,
} from "@/museum/button/useButton";
import type {
  ButtonBridgeHealthState,
  ButtonTransportStatus,
  UsbPortInfo,
} from "@/museum/button/buttonBridge";
import { useButtonLedDebugOverlay } from "@/museum/button/buttonDebug";

type StatusTone = "ok" | "warn" | "error" | "idle";

type BridgeDaemonStatus = "checking" | "running" | "notRunning" | "error";
type BridgeAppStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "unavailable";
type UsbButtonStatus =
  | "connected"
  | "checking"
  | "notDetected"
  | "wrongDevice"
  | "unavailable";

const CHIP_DOT_COLOR: Record<StatusTone, string> = {
  ok: "#4ade80",
  warn: "#fbbf24",
  error: "#f87171",
  idle: "rgba(255, 255, 255, 0.35)",
};

const panelStyle: CSSProperties = {
  border: "1px solid rgba(255, 255, 255, 0.22)",
  borderRadius: 8,
  padding: "12px 14px",
  background: "rgba(0, 0, 0, 0.18)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  minWidth: 0,
};

const panelTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: "0.95rem",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  opacity: 0.9,
};

function getBridgeDaemonStatus(health: ButtonBridgeHealthState): BridgeDaemonStatus {
  switch (health.status) {
    case "checking":
      return "checking";
    case "running":
      return "running";
    case "error":
      return "error";
    default:
      return "notRunning";
  }
}

function getBridgeAppStatus(
  bridgeAvailable: boolean,
  health: ButtonBridgeHealthState,
  bridgeStatus: ButtonTransportStatus,
): BridgeAppStatus {
  if (!bridgeAvailable) return "unavailable";
  if (health.status !== "running") return "unavailable";
  if (bridgeStatus === "error") return "error";
  if (bridgeStatus === "connected") return "connected";
  if (bridgeStatus === "connecting") return "connecting";
  return "disconnected";
}

function getUsbButtonStatus(health: ButtonBridgeHealthState): UsbButtonStatus {
  if (health.status !== "running") return "unavailable";
  if (health.serial === "connected") return "connected";
  if (health.serial === "probing") return "checking";
  if (health.serialDetail === "probe_failed") return "wrongDevice";
  return "notDetected";
}

function formatPortLabel(port: UsbPortInfo): string {
  const vendor = port.vendorId ?? "?";
  const product = port.productId ?? "?";
  return `${vendor}:${product} at ${port.path}`;
}

function getSetupBridgeDetailLines(health: ButtonBridgeHealthState): string[] {
  if (health.status !== "running") {
    return [];
  }

  const lines: string[] = [];
  lines.push(`Bridge version ${health.version}`);

  if (health.expectedVendorId) {
    lines.push(`Looking for USB vendor ${health.expectedVendorId} (Arduino USB)`);
  }

  if (health.serialMessage) {
    lines.push(health.serialMessage);
  }

  if (health.serial !== "connected" && health.scannedPorts.length > 0) {
    const others = health.scannedPorts
      .slice(0, 4)
      .map((port) => formatPortLabel(port))
      .join("; ");
    lines.push(`Visible USB serial: ${others}`);
  }

  if (health.path && health.serial === "connected") {
    lines.push(`USB path ${health.path}`);
  }

  return lines;
}

function getSetupBridgeLogHint(): string {
  return "/var/log/council-button-bridge.log";
}

function statusTone(key: string): StatusTone {
  if (key === "running" || key === "connected") return "ok";
  if (key === "checking" || key === "connecting") return "warn";
  if (key === "error" || key === "wrongDevice") return "error";
  return "idle";
}

function segmentButtonStyle(selected: boolean, isMobile: boolean): CSSProperties {
  return {
    padding: isMobile ? "3px 0" : "6px 0",
    width: "100%",
    fontWeight: selected ? 600 : 400,
    opacity: selected ? 1 : 0.75,
  };
}

function SetupPanel(props: {
  title: string;
  fullWidth?: boolean;
  children: ReactNode;
  testId?: string;
}): ReactElement {
  const { title, fullWidth = false, children, testId } = props;
  return (
    <section
      style={{
        ...panelStyle,
        ...(fullWidth ? { gridColumn: "1 / -1" } : {}),
      }}
      data-testid={testId}
    >
      <h3 style={panelTitleStyle}>{title}</h3>
      {children}
    </section>
  );
}

function SetupSegmented(props: { children: ReactNode; testId?: string }): ReactElement {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        width: "100%",
      }}
      data-testid={props.testId}
    >
      {props.children}
    </div>
  );
}

function SetupStatusChip(props: {
  label: string;
  value: string;
  tone?: StatusTone;
  testId?: string;
}): ReactElement {
  const tone = props.tone ?? "idle";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: "0.92rem",
        whiteSpace: "nowrap",
      }}
      data-testid={props.testId}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: CHIP_DOT_COLOR[tone],
          flexShrink: 0,
        }}
      />
      <span>
        {props.label}: {props.value}
      </span>
    </span>
  );
}

function SetupCollapsible(props: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
  testId?: string;
}): ReactElement {
  const { label, children, defaultOpen = false, testId } = props;
  return (
    <details open={defaultOpen} data-testid={testId}>
      <summary
        style={{
          background: "none",
          border: "none",
          color: "inherit",
          cursor: "pointer",
          font: "inherit",
          padding: 0,
          opacity: 0.85,
          textAlign: "center",
          width: "100%",
          listStyle: "none",
        }}
      >
        {label}
      </summary>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          marginTop: 4,
          fontSize: "0.92rem",
          opacity: 0.88,
        }}
      >
        {children}
      </div>
    </details>
  );
}

/**
 * Staff-only global council options at #setup.
 */
function Setup(): ReactElement {
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

  const showButtonPanel = pushToTalkMode && appMode === "museum";
  const showDevPanel = import.meta.env.DEV;
  const showButtonDetails =
    showButtonPanel &&
    (bridgeDetailLines.length > 0 ||
      daemonStatus === "notRunning" ||
      (daemonStatus === "running" &&
        (usbStatus === "notDetected" || usbStatus === "wrongDevice")));

  return (
    <div
      style={{
        width: "min(96vw, 880px)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <h1 style={{ margin: "0 0 4px", textAlign: "center" }}>{t("setup.title")}</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 12,
          width: "100%",
        }}
      >
        <SetupPanel title={t("setup.panels.installation")}>
          <SetupSegmented>
            <button
              type="button"
              data-testid="app-mode-web"
              data-selected={appMode === "web"}
              onClick={() => setAppMode("web")}
              style={segmentButtonStyle(appMode === "web", isMobile)}
            >
              {t("setup.web")}
            </button>
            <button
              type="button"
              data-testid="app-mode-museum"
              data-selected={appMode === "museum"}
              onClick={() => setAppMode("museum")}
              style={segmentButtonStyle(appMode === "museum", isMobile)}
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
              data-selected={!pushToTalkMode}
              onClick={() => setPushToTalkMode(false)}
              style={segmentButtonStyle(!pushToTalkMode, isMobile)}
            >
              {t("setup.alwaysOn")}
            </button>
            <button
              type="button"
              data-testid="voice-guide-push-to-talk"
              data-selected={pushToTalkMode}
              onClick={() => setPushToTalkMode(true)}
              style={segmentButtonStyle(pushToTalkMode, isMobile)}
            >
              {t("setup.pushToTalk")}
            </button>
          </SetupSegmented>
        </SetupPanel>

        {showButtonPanel ? (
          <SetupPanel title={t("setup.button.title")} fullWidth testId="setup-button-status">
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px 14px",
                justifyContent: "center",
              }}
            >
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
                  <p key={line} data-testid="setup-bridge-detail-line" style={{ margin: 0, textAlign: "center" }}>
                    {line}
                  </p>
                ))}
                {daemonStatus === "notRunning" ? (
                  <p data-testid="setup-button-hint" style={{ margin: 0, textAlign: "center", fontStyle: "italic" }}>
                    {t("setup.button.bridgeNotRunningHint", {
                      logPath: getSetupBridgeLogHint(),
                    })}
                  </p>
                ) : null}
                {daemonStatus === "running" && usbStatus === "notDetected" ? (
                  <p data-testid="setup-button-usb-hint" style={{ margin: 0, textAlign: "center", fontStyle: "italic" }}>
                    {t("setup.button.usbNotDetectedHint")}
                  </p>
                ) : null}
                {daemonStatus === "running" && usbStatus === "wrongDevice" ? (
                  <p
                    data-testid="setup-button-wrong-device-hint"
                    style={{ margin: 0, textAlign: "center", fontStyle: "italic" }}
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
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: "0.95rem",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                data-testid="setup-dev-log-enabled"
                checked={devLogEnabled}
                onChange={(event) => setDevLogEnabled(event.target.checked)}
                style={{ margin: 0, width: "auto" }}
              />
              {t("setup.devLog.enabled")}
            </label>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                data-testid="setup-dev-log-all"
                onClick={() => setAllDevLogCategories(true)}
                style={{ padding: "4px 10px", fontSize: "0.85rem" }}
              >
                {t("setup.devLog.all")}
              </button>
              <button
                type="button"
                data-testid="setup-dev-log-none"
                onClick={() => setAllDevLogCategories(false)}
                style={{ padding: "4px 10px", fontSize: "0.85rem" }}
              >
                {t("setup.devLog.none")}
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(108px, 1fr))",
                gap: "6px 10px",
              }}
            >
              {DEV_LOG_CATEGORIES.map((category) => (
                <label
                  key={category}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: "0.9rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    data-testid={`setup-dev-log-category-${category}`}
                    checked={devLogCategories[category]}
                    disabled={!devLogEnabled}
                    onChange={(event) =>
                      setDevLogCategoryEnabled(category, event.target.checked)
                    }
                    style={{ margin: 0, width: "auto" }}
                  />
                  {t(`setup.devLog.categories.${category}`)}
                </label>
              ))}
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: "0.95rem",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                data-testid="setup-led-debug-toggle"
                checked={ledDebugOverlay}
                onChange={(event) => setLedDebugOverlay(event.target.checked)}
                style={{ margin: 0, width: "auto" }}
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
