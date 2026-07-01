import { useEffect, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  DEV_LOG_CATEGORIES,
  useCouncilSettings,
} from "@/settings/councilSettings";
import type { LogCategory } from "@/logger";
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

const LOG_CATEGORY_COLOR: Record<LogCategory, string> = {
  API: "#d97706",
  SOCKET: "#3b82f6",
  AGENT: "#8b5cf6",
  REALTIME: "#0891b2",
  BUTTON: "#10b981",
  META: "#ec4899",
  AUTOPLAY: "#f59e0b",
  SYSTEM: "#6b7280",
  ERROR: "#ef4444",
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

const setupSegmentButton: CSSProperties = {
  width: "100%",
  fontSize: "19px",
  padding: "4px 12px",
};

const setupCompactButton: CSSProperties = {
  fontSize: "18px",
  padding: "2px 12px",
};

function ledPreviewToggleStyle(active: boolean): CSSProperties {
  if (!active) {
    return setupCompactButton;
  }
  return {
    ...setupCompactButton,
    backgroundColor: "#ef4444",
    borderColor: "#fca5a5",
    color: "white",
    boxShadow:
      "0 0 10px 2px rgba(239, 68, 68, 0.55), 0 0 22px 6px rgba(239, 68, 68, 0.28)",
  };
}

function logCategoryPillStyle(
  category: LogCategory,
  selected: boolean,
  masterEnabled: boolean,
): CSSProperties {
  const accent = LOG_CATEGORY_COLOR[category];
  return {
    fontSize: "16px",
    padding: "2px 12px",
    border: `1.5px solid ${selected ? accent : "white"}`,
    backgroundColor: selected ? accent : "transparent",
    color: selected ? "rgba(0, 0, 0, 0.9)" : "white",
    opacity: masterEnabled ? 1 : 0.4,
    cursor: masterEnabled ? "pointer" : "not-allowed",
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

function SetupSegmented(props: {
  children: ReactNode;
  testId?: string;
  columns?: 2 | 3;
}): ReactElement {
  const { children, testId, columns = 2 } = props;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 8,
        width: "100%",
      }}
      data-testid={testId}
    >
      {children}
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
  const { t } = useTranslation();
  const {
    mode: appMode,
    setAppMode,
    agentMode,
    setAgentMode,
    pttHardwareEnabled,
    setPttHardwareEnabled,
    devLogEnabled,
    setDevLogEnabled,
    devLogCategories,
    setDevLogCategoryEnabled,
    setAllDevLogCategories,
  } = useCouncilSettings();
  const bridgeButtonActive = agentMode === "ptt" && pttHardwareEnabled;
  const { bridgeStatus, bridgeError, bridgeAvailable } =
    useButtonConnection(bridgeButtonActive);
  const bridgeHealth = useButtonBridgeHealth(bridgeButtonActive);
  const { ledDebugOverlay, setLedDebugOverlay } = useButtonLedDebugOverlay();

  const button = useButton("setup");

  useEffect(() => {
    button.claim();
    return () => button.release();
  }, [button.claim, button.release]);

  useEffect(() => {
    button.setLed(button.pressed ? "on" : "pulse");
  }, [button.setLed, button.pressed]);

  const daemonStatus = getBridgeDaemonStatus(bridgeHealth);
  const appStatus = getBridgeAppStatus(bridgeAvailable, bridgeHealth, bridgeStatus);
  const usbStatus = getUsbButtonStatus(bridgeHealth);
  const bridgeDetailLines =
    bridgeHealth.status === "running" ? getSetupBridgeDetailLines(bridgeHealth) : [];

  const showButtonPanel = agentMode === "ptt" && pttHardwareEnabled;
  const showPttOptionsRow = agentMode === "ptt";
  const showLedPreviewPill = import.meta.env.DEV && agentMode === "ptt";
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
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          width: "100%",
        }}
      >
        <SetupPanel title={t("setup.panels.installation")}>
          <SetupSegmented>
            <button
              type="button"
              data-testid="app-mode-web"
              className={appMode === "web" ? "selected" : ""}
              onClick={() => setAppMode("web")}
              style={setupSegmentButton}
            >
              {t("setup.web")}
            </button>
            <button
              type="button"
              data-testid="app-mode-museum"
              className={appMode === "museum" ? "selected" : ""}
              onClick={() => setAppMode("museum")}
              style={setupSegmentButton}
            >
              {t("setup.museum")}
            </button>
          </SetupSegmented>
        </SetupPanel>

        <SetupPanel title={t("setup.panels.agentMode")}>
          <SetupSegmented columns={appMode === "web" ? 3 : 2}>
            {appMode === "web" ? (
              <button
                type="button"
                data-testid="agent-mode-off"
                className={agentMode === "off" ? "selected" : ""}
                onClick={() => setAgentMode("off")}
                style={setupSegmentButton}
              >
                {t("setup.logging.off")}
              </button>
            ) : null}
            <button
              type="button"
              data-testid="agent-mode-always-on"
              className={agentMode === "always-on" ? "selected" : ""}
              onClick={() => setAgentMode("always-on")}
              style={setupSegmentButton}
            >
              {t("agentMode.alwaysOn")}
            </button>
            <button
              type="button"
              data-testid="agent-mode-ptt"
              className={agentMode === "ptt" ? "selected" : ""}
              onClick={() => setAgentMode("ptt")}
              style={setupSegmentButton}
            >
              {t("agentMode.pushToTalk")}
            </button>
          </SetupSegmented>
          {showPttOptionsRow ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <button
                type="button"
                data-testid="setup-ptt-hardware-toggle"
                className={pttHardwareEnabled ? "control" : ""}
                aria-pressed={pttHardwareEnabled}
                onClick={() => setPttHardwareEnabled(!pttHardwareEnabled)}
                style={{...ledPreviewToggleStyle(pttHardwareEnabled), flex: 1}}
              >
                {t("setup.button.hardwareButton")}
              </button>
              {showLedPreviewPill ? (
                <button
                  type="button"
                  data-testid="setup-led-debug-toggle"
                  className={ledDebugOverlay ? "control" : ""}
                  aria-pressed={ledDebugOverlay}
                  onClick={() => setLedDebugOverlay(!ledDebugOverlay)}
                  style={{...ledPreviewToggleStyle(ledDebugOverlay), flex: 1}}
                >
                  {t("setup.button.ledDebugOverlay")}
                </button>
              ) : null}
            </div>
          ) : null}
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

        <SetupPanel title={t("setup.panels.logging")} testId="setup-logging-panel">
            <SetupSegmented testId="setup-logging-master">
              <button
                type="button"
                data-testid="setup-dev-log-on"
                className={devLogEnabled ? "selected" : ""}
                aria-pressed={devLogEnabled}
                onClick={() => setDevLogEnabled(true)}
                style={setupSegmentButton}
              >
                {t("setup.logging.on")}
              </button>
              <button
                type="button"
                data-testid="setup-dev-log-off"
                className={!devLogEnabled ? "selected" : ""}
                aria-pressed={!devLogEnabled}
                onClick={() => setDevLogEnabled(false)}
                style={setupSegmentButton}
              >
                {t("setup.logging.off")}
              </button>
            </SetupSegmented>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                data-testid="setup-dev-log-all"
                disabled={!devLogEnabled}
                onClick={() => setAllDevLogCategories(true)}
                style={{
                  ...setupCompactButton,
                  opacity: devLogEnabled ? 1 : 0.4,
                }}
              >
                {t("setup.logging.all")}
              </button>
              <button
                type="button"
                data-testid="setup-dev-log-none"
                disabled={!devLogEnabled}
                onClick={() => setAllDevLogCategories(false)}
                style={{
                  ...setupCompactButton,
                  opacity: devLogEnabled ? 1 : 0.4,
                }}
              >
                {t("setup.logging.none")}
              </button>
            </div>

            <div
              role="group"
              aria-label={t("setup.logging.categoriesLabel")}
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
              }}
            >
              {DEV_LOG_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  data-testid={`setup-dev-log-category-${category}`}
                  aria-pressed={devLogCategories[category]}
                  disabled={!devLogEnabled}
                  onClick={() =>
                    setDevLogCategoryEnabled(category, !devLogCategories[category])
                  }
                  style={logCategoryPillStyle(
                    category,
                    devLogCategories[category],
                    devLogEnabled,
                  )}
                >
                  {t(`setup.logging.categories.${category}`)}
                </button>
              ))}
            </div>
          </SetupPanel>
      </div>
    </div>
  );
}

export default Setup;
