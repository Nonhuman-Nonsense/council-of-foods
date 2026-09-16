import { useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  APP_MODES,
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
  BridgePrintHealth,
  ButtonBridgeHealthState,
  ButtonTransportStatus,
  UsbPortInfo,
} from "@/museum/button/buttonBridge";
import { useButtonLedDebugOverlay } from "@/museum/button/buttonDebug";
import { modeSwitchButtonToggleStyle } from "@/museum/ModeSwitchButton";
import ProtocolDocument from "@council/protocol/ProtocolDocument";
import { createProtocolPdf } from "@council/protocol/protocolPdf";
import { sendTestPage, type TestPageOutcome } from "@/museum/print/printClient";
import { describePrinterReason } from "@shared/printerReasons";

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
  TURN: "#16a34a",
  BUTTON: "#10b981",
  META: "#ec4899",
  AUTOPLAY: "#f59e0b",
  PRINT: "#94a3b8",
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

function getStaffBridgeDetailLines(health: ButtonBridgeHealthState): string[] {
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

type PrinterStatus =
  | "unavailable"
  | "outdated"
  | "disabled"
  | "checking"
  | "noDefault"
  | "idle"
  | "printing"
  | "stopped"
  | "unknown";

type EnabledPrintHealth = Extract<BridgePrintHealth, { enabled: true }>;

function getPrintHealth(health: ButtonBridgeHealthState): EnabledPrintHealth | null {
  return health.status === "running" && health.print?.enabled ? health.print : null;
}

function getPrinterStatus(health: ButtonBridgeHealthState): PrinterStatus {
  if (health.status !== "running") return "unavailable";
  if (!health.print) return "outdated";
  if (!health.print.enabled) return "disabled";
  if (!health.print.printer) return "checking";
  if (!health.print.printer.name) return "noDefault";
  return health.print.printer.state;
}

function printerStatusTone(status: PrinterStatus): StatusTone {
  if (status === "idle" || status === "printing") return "ok";
  if (status === "checking" || status === "unknown") return "warn";
  if (status === "unavailable") return "idle";
  return "error";
}

function getStaffPrintDetailLines(print: EnabledPrintHealth): string[] {
  const lines: string[] = [];
  if (print.printer?.message) lines.push(print.printer.message);
  if (print.printer && print.printer.alerts.length > 0) {
    lines.push(`Printer alerts: ${print.printer.alerts.join(", ")}`);
  }
  if (print.lastError) lines.push(`Last error: ${print.lastError}`);
  if (print.lastPrintedAt) {
    lines.push(`Last printed ${new Date(print.lastPrintedAt).toLocaleString()}`);
  }
  return lines;
}

function getStaffBridgeLogHint(): string {
  return "/var/log/council-button-bridge.log";
}

function statusTone(key: string): StatusTone {
  if (key === "running" || key === "connected") return "ok";
  if (key === "checking" || key === "connecting") return "warn";
  if (key === "error" || key === "wrongDevice") return "error";
  return "idle";
}

const staffSegmentButton: CSSProperties = {
  width: "100%",
  fontSize: "19px",
  padding: "4px 12px",
};

const staffCompactButton: CSSProperties = {
  fontSize: "18px",
  padding: "2px 12px",
};

function ledPreviewToggleStyle(active: boolean): CSSProperties {
  if (!active) {
    return staffCompactButton;
  }
  return {
    ...staffCompactButton,
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

function StaffPanel(props: {
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

function StaffSegmented(props: {
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

function StaffStatusChip(props: {
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

function StaffCollapsible(props: {
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
 * Staff-only global council options at #staff.
 */
function Staff(): ReactElement {
  const { t } = useTranslation();
  const {
    mode: appMode,
    setAppMode,
    pttHardwareEnabled,
    setPttHardwareEnabled,
    printSummariesEnabled,
    setPrintSummariesEnabled,
    capabilities,
    modeSwitchButtonEnabled,
    setModeSwitchButtonEnabled,
    devLogEnabled,
    setDevLogEnabled,
    devLogCategories,
    setDevLogCategoryEnabled,
    setAllDevLogCategories,
  } = useCouncilSettings();
  const bridgeButtonActive = pttHardwareEnabled;
  const { bridgeStatus, bridgeError, bridgeAvailable } =
    useButtonConnection(bridgeButtonActive);
  const bridgeHealth = useButtonBridgeHealth(bridgeButtonActive || printSummariesEnabled);
  const { ledDebugOverlay, setLedDebugOverlay } = useButtonLedDebugOverlay();

  const testPageRef = useRef<HTMLDivElement>(null);
  const [testPage, setTestPage] = useState<"idle" | "sending" | TestPageOutcome>("idle");

  const printTestPage = async (): Promise<void> => {
    if (!testPageRef.current) return;
    setTestPage("sending");
    try {
      const pdf = await createProtocolPdf(testPageRef.current);
      setTestPage(await sendTestPage(pdf.output("blob")));
    } catch {
      setTestPage("rejected");
    }
  };

  const button = useButton("staff");

  useEffect(() => {
    button.claim();
    return () => button.release();
  }, [button.claim, button.release]);

  useEffect(() => {
    button.setArmed(true);
  }, [button.setArmed]);

  const daemonStatus = getBridgeDaemonStatus(bridgeHealth);
  const appStatus = getBridgeAppStatus(bridgeAvailable, bridgeHealth, bridgeStatus);
  const usbStatus = getUsbButtonStatus(bridgeHealth);
  const bridgeDetailLines =
    bridgeHealth.status === "running" ? getStaffBridgeDetailLines(bridgeHealth) : [];

  const printerStatus = getPrinterStatus(bridgeHealth);
  const printHealth = getPrintHealth(bridgeHealth);
  const printDetailLines = printHealth ? getStaffPrintDetailLines(printHealth) : [];
  // Protocols not yet on paper: still in the bridge's folder, or accepted by the printer.
  const printWaiting = printHealth ? printHealth.pending + (printHealth.printer?.queuedJobs ?? 0) : 0;

  // One panel for everything that goes through the bridge: the hardware button
  // and the printer each add their chips and hints when staff switch them on.
  const showBridgePanel = pttHardwareEnabled || printSummariesEnabled;
  const showUsbHint =
    pttHardwareEnabled && daemonStatus === "running" && usbStatus === "notDetected";
  const showWrongDeviceHint =
    pttHardwareEnabled && daemonStatus === "running" && usbStatus === "wrongDevice";
  const buttonDetailLines = pttHardwareEnabled ? bridgeDetailLines : [];
  const printerDetailLines = printSummariesEnabled ? printDetailLines : [];
  const showBridgeDetails =
    buttonDetailLines.length > 0 ||
    printerDetailLines.length > 0 ||
    daemonStatus === "notRunning" ||
    showUsbHint ||
    showWrongDeviceHint;

  return (
    <div
      style={{
        width: "min(96vw, 880px)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <h1 style={{ margin: "0 0 4px", textAlign: "center" }}>{t("staff.title")}</h1>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          width: "100%",
        }}
      >
        <StaffPanel title={t("staff.panels.installation")} fullWidth>
          <StaffSegmented columns={APP_MODES.length}>
            {APP_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                data-testid={`app-mode-${mode}`}
                className={appMode === mode ? "selected" : ""}
                onClick={() => setAppMode(mode)}
                style={staffSegmentButton}
              >
                {t(`staff.${mode}`)}
              </button>
            ))}
          </StaffSegmented>
          {/* Second row: independent of the mode — each is a staff aid that can
              be wanted in either install (a laptop can drive a real button). */}
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
              data-testid="staff-mode-switch-button-toggle"
              className={modeSwitchButtonEnabled ? "control" : ""}
              aria-pressed={modeSwitchButtonEnabled}
              onClick={() => setModeSwitchButtonEnabled(!modeSwitchButtonEnabled)}
              style={modeSwitchButtonToggleStyle(modeSwitchButtonEnabled, {
                ...staffCompactButton,
                flex: 1,
              })}
            >
              {t("staff.modeSwitchButton")}
            </button>
            <button
              type="button"
              data-testid="staff-ptt-hardware-toggle"
              className={pttHardwareEnabled ? "control" : ""}
              aria-pressed={pttHardwareEnabled}
              onClick={() => setPttHardwareEnabled(!pttHardwareEnabled)}
              style={{ ...ledPreviewToggleStyle(pttHardwareEnabled), flex: 1 }}
            >
              {t("staff.button.hardwareButton")}
            </button>
            <button
              type="button"
              data-testid="staff-print-summaries-toggle"
              className={printSummariesEnabled ? "control" : ""}
              aria-pressed={printSummariesEnabled}
              onClick={() => setPrintSummariesEnabled(!printSummariesEnabled)}
              style={{ ...ledPreviewToggleStyle(printSummariesEnabled), flex: 1 }}
            >
              {t("staff.print.toggle")}
            </button>
            <button
              type="button"
              data-testid="staff-led-debug-toggle"
              className={ledDebugOverlay ? "control" : ""}
              aria-pressed={ledDebugOverlay}
              onClick={() => setLedDebugOverlay(!ledDebugOverlay)}
              style={{ ...ledPreviewToggleStyle(ledDebugOverlay), flex: 1 }}
            >
              {t("staff.button.ledDebugOverlay")}
            </button>
          </div>
        </StaffPanel>

        {showBridgePanel ? (
          <StaffPanel title={t("staff.bridge.title")} fullWidth testId="staff-bridge-panel">
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px 14px",
                justifyContent: "center",
              }}
            >
              <StaffStatusChip
                label={t("staff.button.bridgeLabel")}
                value={t(`staff.button.bridge.${daemonStatus}`)}
                tone={statusTone(daemonStatus)}
                testId="staff-bridge-daemon-status"
              />
              {pttHardwareEnabled ? (
                <>
                  <StaffStatusChip
                    label={t("staff.button.appLabel")}
                    value={
                      appStatus === "error" && bridgeError
                        ? `${t(`staff.button.app.${appStatus}`)} — ${bridgeError}`
                        : t(`staff.button.app.${appStatus}`)
                    }
                    tone={statusTone(appStatus)}
                    testId="staff-bridge-app-status"
                  />
                  <StaffStatusChip
                    label={t("staff.button.usbLabel")}
                    value={t(`staff.button.usb.${usbStatus}`)}
                    tone={statusTone(usbStatus)}
                    testId="staff-button-usb-status"
                  />
                </>
              ) : null}
              {printSummariesEnabled ? (
                <>
                  <StaffStatusChip
                    label={t("staff.print.printerLabel")}
                    value={
                      printHealth?.printer?.name
                        ? `${printHealth.printer.name} — ${t(`staff.print.printer.${printerStatus}`)}`
                        : t(`staff.print.printer.${printerStatus}`)
                    }
                    tone={printerStatusTone(printerStatus)}
                    testId="staff-print-printer-status"
                  />
                  {printHealth ? (
                    <StaffStatusChip
                      label={t("staff.print.pendingLabel")}
                      value={String(printWaiting)}
                      tone={printWaiting > 0 ? "warn" : "ok"}
                      testId="staff-print-pending"
                    />
                  ) : null}
                  {printHealth?.attention ? (
                    <StaffStatusChip
                      label={t("staff.print.attentionLabel")}
                      value={`${describePrinterReason(printHealth.attention.reason)} (${t("staff.print.since", {
                        time: new Date(printHealth.attention.since).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                      })})`}
                      tone="error"
                      testId="staff-print-attention"
                    />
                  ) : null}
                </>
              ) : null}
            </div>

            {printSummariesEnabled ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                <button
                  type="button"
                  data-testid="staff-print-test-page"
                  disabled={testPage === "sending"}
                  onClick={() => void printTestPage()}
                  style={staffCompactButton}
                >
                  {t("staff.print.testPage")}
                </button>
                {testPage !== "idle" ? (
                  <span data-testid="staff-print-test-page-result">
                    {t(`staff.print.testPageResult.${testPage}`)}
                  </span>
                ) : null}
                {/* The test page is a real protocol, so it exercises the same PDF path. */}
                <div style={{ position: "absolute", top: 0, display: "none" }}>
                  <ProtocolDocument
                    ref={testPageRef}
                    summaryText={t("staff.print.testPageText")}
                    meetingId="TEST"
                  />
                </div>
              </div>
            ) : null}

            {printSummariesEnabled && !capabilities.printSummary ? (
              <p data-testid="staff-print-mode-hint" style={{ margin: 0, textAlign: "center", fontStyle: "italic" }}>
                {t("staff.print.modeHint")}
              </p>
            ) : null}

            {showBridgeDetails ? (
              <StaffCollapsible
                label={t("staff.panels.details")}
                testId="staff-bridge-details"
              >
                {buttonDetailLines.map((line) => (
                  <p key={line} data-testid="staff-bridge-detail-line" style={{ margin: 0, textAlign: "center" }}>
                    {line}
                  </p>
                ))}
                {printerDetailLines.map((line) => (
                  <p key={line} data-testid="staff-print-detail-line" style={{ margin: 0, textAlign: "center" }}>
                    {line}
                  </p>
                ))}
                {daemonStatus === "notRunning" ? (
                  <p data-testid="staff-button-hint" style={{ margin: 0, textAlign: "center", fontStyle: "italic" }}>
                    {t("staff.button.bridgeNotRunningHint", {
                      logPath: getStaffBridgeLogHint(),
                    })}
                  </p>
                ) : null}
                {showUsbHint ? (
                  <p data-testid="staff-button-usb-hint" style={{ margin: 0, textAlign: "center", fontStyle: "italic" }}>
                    {t("staff.button.usbNotDetectedHint")}
                  </p>
                ) : null}
                {showWrongDeviceHint ? (
                  <p
                    data-testid="staff-button-wrong-device-hint"
                    style={{ margin: 0, textAlign: "center", fontStyle: "italic" }}
                  >
                    {t("staff.button.usbWrongDeviceHint")}
                  </p>
                ) : null}
              </StaffCollapsible>
            ) : null}
          </StaffPanel>
        ) : null}

        <StaffPanel title={t("staff.panels.logging")} testId="staff-logging-panel">
            <StaffSegmented testId="staff-logging-master">
              <button
                type="button"
                data-testid="staff-dev-log-on"
                className={devLogEnabled ? "selected" : ""}
                aria-pressed={devLogEnabled}
                onClick={() => setDevLogEnabled(true)}
                style={staffSegmentButton}
              >
                {t("staff.logging.on")}
              </button>
              <button
                type="button"
                data-testid="staff-dev-log-off"
                className={!devLogEnabled ? "selected" : ""}
                aria-pressed={!devLogEnabled}
                onClick={() => setDevLogEnabled(false)}
                style={staffSegmentButton}
              >
                {t("staff.logging.off")}
              </button>
            </StaffSegmented>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                data-testid="staff-dev-log-all"
                disabled={!devLogEnabled}
                onClick={() => setAllDevLogCategories(true)}
                style={{
                  ...staffCompactButton,
                  opacity: devLogEnabled ? 1 : 0.4,
                }}
              >
                {t("staff.logging.all")}
              </button>
              <button
                type="button"
                data-testid="staff-dev-log-none"
                disabled={!devLogEnabled}
                onClick={() => setAllDevLogCategories(false)}
                style={{
                  ...staffCompactButton,
                  opacity: devLogEnabled ? 1 : 0.4,
                }}
              >
                {t("staff.logging.none")}
              </button>
            </div>

            <div
              role="group"
              aria-label={t("staff.logging.categoriesLabel")}
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
                  data-testid={`staff-dev-log-category-${category}`}
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
                  {t(`staff.logging.categories.${category}`)}
                </button>
              ))}
            </div>
          </StaffPanel>
      </div>
    </div>
  );
}

export default Staff;
