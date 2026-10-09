import { useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { LetterView, PrintableLetterReply } from "@shared/ModelTypes";
import {
  APP_MODES,
  DEV_LOG_CATEGORIES,
  useCouncilSettings,
  getVenueId,
  setVenueId,
} from "@/settings/councilSettings";
import type { LogCategory } from "@/logger";
import {
  useButton,
  useButtonConnection,
  useButtonBridgeHealth,
} from "@/museum/button/useButton";
import type {
  BridgeAlertsHealth,
  BridgePrintHealth,
  ButtonBridgeHealthState,
  ButtonTransportStatus,
  UsbPortInfo,
} from "@/museum/button/buttonBridge";
import { useButtonLedDebugOverlay } from "@/museum/button/buttonDebug";
import { modeSwitchButtonToggleStyle } from "@/museum/ModeSwitchButton";
import LetterDocument, { letterFields, replyFields } from "@council/protocol/LetterDocument";
import { letterBody } from "@council/protocol/summaryDocument";
import { useRouting } from "@/navigation";
import { createProtocolPdf } from "@council/protocol/protocolPdf";
import { sendTestPage, type TestPageOutcome } from "@/museum/print/printClient";
import { describePrinterReason } from "@shared/printerReasons";
import { fetchVenues, type Venue } from "@api/venues";
import { getServerLogStatus } from "@/logging/serverLogSink";
import { useFocusTrap } from "./useFocusTrap";
import {
  chooseAlertVenue,
  saveInstallationKey,
  sendTestAlert,
} from "@/museum/print/alertsClient";

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

type InstallationKeyStatus = "outdated" | "missing" | "otherServer" | "saved";

/** Whether the bridge holds the installation key for the server this page came from. */
function getInstallationKeyStatus(alerts: BridgeAlertsHealth, origin: string): InstallationKeyStatus {
  if (alerts.server === undefined) return "outdated";
  if (alerts.server === null) return "missing";
  return alerts.server === origin ? "saved" : "otherServer";
}

const INSTALLATION_KEY_STATUS_TONE: Record<InstallationKeyStatus, StatusTone> = {
  outdated: "warn",
  missing: "warn",
  otherServer: "warn",
  saved: "ok",
};

type AlertsStatus = "noKey" | "chooseVenue" | "failing" | "on";

function getAlertsStatus(alerts: BridgeAlertsHealth, keyStatus: InstallationKeyStatus): AlertsStatus {
  if (keyStatus !== "saved") return "noKey";
  if (!alerts.venue) return "chooseVenue";
  if (alerts.lastError) return "failing";
  return "on";
}

const ALERTS_STATUS_TONE: Record<AlertsStatus, StatusTone> = {
  noKey: "idle",
  chooseVenue: "warn",
  failing: "error",
  on: "ok",
};

function getStaffAlertDetailLines(alerts: BridgeAlertsHealth): string[] {
  const lines: string[] = [];
  if (alerts.venue) lines.push(`Alert emails go to ${alerts.venue.recipients.join(", ")}`);
  if (alerts.lastSentAt) lines.push(`Last alert sent ${new Date(alerts.lastSentAt).toLocaleString()}`);
  if (alerts.lastError) lines.push(`Alert error: ${alerts.lastError}`);
  return lines;
}

/** The test print is a sample letter and a reply to it, so staff see exactly what visitors' prints look like. */
const TEST_LETTER_MEETING_ID = 1400;

function testLetter(t: TFunction): LetterView {
  return {
    authorId: "test",
    authorName: t("staff.print.testLetter.from"),
    authorEmail: t("staff.print.testLetter.fromEmail"),
    recipientName: t("staff.print.testLetter.to"),
    recipientOrganisation: t("staff.print.testLetter.organisation"),
    recipientEmail: t("staff.print.testLetter.toEmail"),
    sentAt: new Date().toISOString(),
    subject: t("staff.print.testLetter.subject"),
    body: t("staff.print.testLetter.body"),
    humanNote: null,
    footer: "",
    present: true,
    send: true,
    sendReason: null,
  };
}

function testReply(t: TFunction, language: string): PrintableLetterReply {
  const letter = testLetter(t);
  return {
    id: "test",
    meetingId: TEST_LETTER_MEETING_ID,
    kind: "reply",
    fromName: t("staff.print.testReply.from"),
    fromAddress: t("staff.print.testReply.fromEmail"),
    subject: t("staff.print.testReply.subject"),
    message: t("staff.print.testReply.body"),
    receivedAt: new Date().toISOString(),
    letter: { authorId: letter.authorId, authorName: letter.authorName, recipientName: letter.recipientName, subject: letter.subject, language },
  };
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

/** Text fields and pickers, drawn like the outlined buttons beside them. */
const staffFieldStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontFamily: "inherit",
  fontSize: "17px",
  lineHeight: 1.4,
  color: "white",
  background: "rgba(255, 255, 255, 0.06)",
  border: "1.5px solid rgba(255, 255, 255, 0.55)",
  borderRadius: 19,
  padding: "2px 14px",
};

const staffSelectStyle: CSSProperties = {
  ...staffFieldStyle,
  appearance: "none",
  cursor: "pointer",
  paddingRight: 36,
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5l5 5 5-5' fill='none' stroke='white' stroke-width='1.6'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 14px center",
};

/** The open list is drawn by the system, often on white. */
const staffOptionStyle: CSSProperties = { color: "black" };

const STAFF_ROW_LABEL_WIDTH = 130;

/** "Hear yourself" steps; the visitor's headphone amp does the fine adjustment. */
const SIDETONE_LEVELS = [0, 0.25, 0.5, 0.75, 1];
const STAFF_ROW_GAP = 12;

const staffLabelStyle: CSSProperties = { opacity: 0.75, whiteSpace: "nowrap" };

/** A label with its control, kept together when a line wraps. */
const staffFieldGroupStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, minWidth: 0 };

/** The outcome of a test, beside its button. */
const staffResultStyle: CSSProperties = { fontSize: "0.92rem", fontStyle: "italic", opacity: 0.85 };

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
  /** Rows closer together, for panels that are lists of statuses. */
  compact?: boolean;
  /** Shown on the right of the title, e.g. a status that belongs to the whole panel. */
  titleAside?: ReactNode;
  children: ReactNode;
  testId?: string;
}): ReactElement {
  const { title, fullWidth = false, compact = false, titleAside, children, testId } = props;
  return (
    <section
      style={{
        ...panelStyle,
        ...(fullWidth ? { gridColumn: "1 / -1" } : {}),
        ...(compact ? { gap: 6 } : {}),
      }}
      data-testid={testId}
    >
      {titleAside ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "4px 12px",
            marginBottom: compact ? 2 : 0,
          }}
        >
          <h3 style={panelTitleStyle}>{title}</h3>
          {titleAside}
        </div>
      ) : (
        <h3 style={panelTitleStyle}>{title}</h3>
      )}
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
  /** Left out when the row's own label says what this is. */
  label?: string;
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
      <span>{props.label ? `${props.label}: ${props.value}` : props.value}</span>
    </span>
  );
}

/** One line of the Installation panel: what it is, its status, and an action on the right. */
function StaffRow(props: {
  label: string;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}): ReactElement {
  return (
    <div
      style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: `4px ${STAFF_ROW_GAP}px` }}
      title={props.title}
    >
      <span style={{ ...staffLabelStyle, flex: "0 0 auto", minWidth: STAFF_ROW_LABEL_WIDTH }}>{props.label}</span>
      <div
        style={{
          flex: "1 1 240px",
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "6px 14px",
          minWidth: 0,
        }}
      >
        {props.children}
      </div>
      {props.action ? (
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>{props.action}</div>
      ) : null}
    </div>
  );
}

/** A result or explanation under a row, lined up with its status unless `indent` is false. */
function StaffRowNote(props: { children: ReactNode; tone?: "error"; indent?: boolean; testId?: string }): ReactElement {
  return (
    <p
      data-testid={props.testId}
      style={{
        margin: "-2px 0 0",
        paddingLeft: props.indent === false ? 0 : STAFF_ROW_LABEL_WIDTH + STAFF_ROW_GAP,
        fontSize: "0.92rem",
        fontStyle: "italic",
        color: props.tone === "error" ? CHIP_DOT_COLOR.error : undefined,
        opacity: props.tone === "error" ? 1 : 0.8,
      }}
    >
      {props.children}
    </p>
  );
}

function StaffDivider(): ReactElement {
  return <hr style={{ width: "100%", margin: "2px 0", border: 0, borderTop: "1px solid rgba(255, 255, 255, 0.14)" }} />;
}

/** On/off for a feature, lit like the other staff toggles while on. */
/** Says so when the log is not reaching the server; silent while it is. */
function ServerLogFailureNote(): ReactElement | null {
  const { t } = useTranslation();
  const [status, setStatus] = useState(getServerLogStatus);
  useEffect(() => {
    const id = window.setInterval(() => setStatus(getServerLogStatus()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!status.failure) return null;
  return (
    <StaffRowNote testId="staff-server-log-status" tone="error" indent={false}>
      {t("staff.logging.server.failing", { failure: status.failure, pending: status.pending })}
    </StaffRowNote>
  );
}

function StaffToggle(props: { on: boolean; onChange: (on: boolean) => void; testId: string }): ReactElement {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      data-testid={props.testId}
      className={props.on ? "control" : ""}
      aria-pressed={props.on}
      onClick={() => props.onChange(!props.on)}
      style={{ ...ledPreviewToggleStyle(props.on), minWidth: 64 }}
    >
      {props.on ? t("staff.toggle.on") : t("staff.toggle.off")}
    </button>
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
  const { t, i18n } = useTranslation();
  const {
    mode: appMode,
    setAppMode,
    pttHardwareEnabled,
    setPttHardwareEnabled,
    printSummariesEnabled,
    setPrintSummariesEnabled,
    splitAudioEnabled,
    setSplitAudioEnabled,
    sidetoneLevel,
    setSidetoneLevel,
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
  const alertsHealth = bridgeHealth.status === "running" ? bridgeHealth.alerts : null;
  const keyStatus = alertsHealth ? getInstallationKeyStatus(alertsHealth, window.location.origin) : null;
  const alertsStatus = alertsHealth && keyStatus ? getAlertsStatus(alertsHealth, keyStatus) : null;
  const keySaved = keyStatus === "saved";
  const { ledDebugOverlay, setLedDebugOverlay } = useButtonLedDebugOverlay();

  const [venueId, setVenueIdState] = useState(getVenueId);

  const testPageRef = useRef<HTMLDivElement>(null);
  const testReplyRef = useRef<HTMLDivElement>(null);
  const { meetingPath } = useRouting();
  const [testPage, setTestPage] = useState<"idle" | "sending" | TestPageOutcome>("idle");

  /** A letter, then a reply: two sheets, each its own job, reporting the first that did not queue. */
  const printTestPage = async (): Promise<void> => {
    const pages = [testPageRef.current, testReplyRef.current];
    if (pages.some((page) => !page)) return;
    setTestPage("sending");
    try {
      let outcome: TestPageOutcome = "queued";
      for (const page of pages) {
        const pdf = await createProtocolPdf(page!, { magnetMark: true });
        outcome = await sendTestPage(pdf.output("blob"));
        if (outcome !== "queued") break;
      }
      setTestPage(outcome);
    } catch {
      setTestPage("rejected");
    }
  };

  const [venues, setVenues] = useState<Venue[] | null>(null);
  const [venueError, setVenueError] = useState<string | null>(null);
  const [testAlert, setTestAlert] = useState<{ state: "idle" | "sending" | "sent" } | { state: "failed"; error: string }>({
    state: "idle",
  });
  const [keyDraft, setKeyDraft] = useState("");
  /** Staff pressed Change on a saved key. */
  const [keyEditing, setKeyEditing] = useState(false);
  const [keySave, setKeySave] = useState<{ state: "idle" | "saving" | "saved" } | { state: "failed"; error: string }>({
    state: "idle",
  });

  const saveKey = async (): Promise<void> => {
    setKeySave({ state: "saving" });
    try {
      await saveInstallationKey(keyDraft.trim());
      setKeyDraft("");
      setKeyEditing(false);
      setKeySave({ state: "saved" });
    } catch (error) {
      setKeySave({ state: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  };
  // The field shows while there is no usable key, after a refusal, or once staff press Change.
  const editingKey =
    keySave.state !== "saved" &&
    (keyStatus === "missing" || keyStatus === "otherServer" || keySave.state === "failed" || keyEditing);

  const button = useButton("staff");

  // Staff at an installation may have a keyboard and no mouse.
  const pageRef = useRef<HTMLDivElement>(null);
  useFocusTrap(pageRef);

  useEffect(() => {
    button.claim();
    return () => button.release();
  }, [button.claim, button.release]);

  useEffect(() => {
    button.setArmed(true);
  }, [button.setArmed]);

  useEffect(() => {
    let cancelled = false;
    fetchVenues().then(
      (list) => {
        if (!cancelled) setVenues(list);
      },
      (error: unknown) => {
        if (!cancelled) setVenueError(error instanceof Error ? error.message : String(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const tellBridgeVenue = async (id: string): Promise<void> => {
    try {
      await chooseAlertVenue(id === "" ? null : id);
      setVenueError(null);
    } catch (error) {
      setVenueError(error instanceof Error ? error.message : String(error));
    }
  };

  const chooseVenue = (id: string): void => {
    setVenueId(id);
    setVenueIdState(getVenueId());
    if (keySaved) void tellBridgeVenue(id);
  };

  // One venue for the installation: the page's choice is the truth, and the bridge follows it.
  // A bridge that already had a venue (set before the page stored one) hands it to the page, so
  // nobody has to choose again. Once per difference, so a refusing bridge is not asked in a loop.
  const bridgeVenueId = alertsHealth?.venue?.id ?? "";
  const syncedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!keySaved || bridgeVenueId === venueId) return;
    if (!venueId && bridgeVenueId) {
      setVenueId(bridgeVenueId);
      setVenueIdState(bridgeVenueId);
      return;
    }
    const attempt = `${venueId}←${bridgeVenueId}`;
    if (syncedRef.current === attempt) return;
    syncedRef.current = attempt;
    void tellBridgeVenue(venueId);
  }, [keySaved, bridgeVenueId, venueId]);

  const sendAlertTest = async (): Promise<void> => {
    setTestAlert({ state: "sending" });
    try {
      await sendTestAlert();
      setTestAlert({ state: "sent" });
    } catch (error) {
      setTestAlert({ state: "failed", error: error instanceof Error ? error.message : String(error) });
    }
  };

  const daemonStatus = getBridgeDaemonStatus(bridgeHealth);
  const appStatus = getBridgeAppStatus(bridgeAvailable, bridgeHealth, bridgeStatus);
  const usbStatus = getUsbButtonStatus(bridgeHealth);
  const bridgeDetailLines =
    bridgeHealth.status === "running" ? getStaffBridgeDetailLines(bridgeHealth) : [];

  const printerStatus = getPrinterStatus(bridgeHealth);
  const printHealth = getPrintHealth(bridgeHealth);
  const printDetailLines = [
    ...(printHealth ? getStaffPrintDetailLines(printHealth) : []),
    ...(alertsHealth ? getStaffAlertDetailLines(alertsHealth) : []),
  ];
  // Protocols not yet on paper: still in the bridge's folder, or accepted by the printer.
  const printWaiting = printHealth ? printHealth.pending + (printHealth.printer?.queuedJobs ?? 0) : 0;

  // The bridge only matters once the hardware button or printing is on.
  const showBridge = pttHardwareEnabled || printSummariesEnabled;
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
      ref={pageRef}
      tabIndex={-1}
      className="staff-page"
      style={{
        outline: "none",
        width: "min(96vw, 880px)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        // Taller than the window: the staff page scrolls on its own, inside the overlay.
        minHeight: 0,
        maxHeight: "100%",
        overflowY: "auto",
        overscrollBehavior: "contain",
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
        <StaffPanel title={t("staff.panels.mode")} fullWidth>
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
          {/* Screen aids, independent of the mode. */}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
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

        {/* Where the installation runs, and everything that goes through the bridge: the
            hardware button and the printer each add their status when staff switch them on. */}
        <StaffPanel
          title={t("staff.panels.installation")}
          fullWidth
          compact
          testId="staff-installation-panel"
          titleAside={
            showBridge ? (
              <StaffStatusChip
                label={t("staff.button.bridgeLabel")}
                value={
                  bridgeHealth.status === "running"
                    ? `${t(`staff.button.bridge.${daemonStatus}`)} · v${bridgeHealth.version}`
                    : t(`staff.button.bridge.${daemonStatus}`)
                }
                tone={statusTone(daemonStatus)}
                testId="staff-bridge-daemon-status"
              />
            ) : null
          }
        >
          {/* Where it runs, and the key the bridge needs there: one line, wrapping on narrow screens. */}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px 28px" }}>
            <label style={staffFieldGroupStyle} title={t("staff.venue.hint")}>
              <span style={staffLabelStyle}>{t("staff.venue.label")}</span>
              <select
                data-testid="staff-venue"
                value={venueId}
                disabled={venues === null && venueError === null}
                onChange={(event) => chooseVenue(event.target.value)}
                style={{ ...staffSelectStyle, flex: "0 1 auto", maxWidth: 260 }}
              >
                <option value="" style={staffOptionStyle}>{t("staff.venue.none")}</option>
                {(venues ?? []).map((venue) => (
                  <option key={venue.id} value={venue.id} style={staffOptionStyle}>
                    {venue.name}
                  </option>
                ))}
                {venueId && venues && !venues.some((venue) => venue.id === venueId) ? (
                  <option value={venueId} style={staffOptionStyle}>
                    {t("staff.venue.unknown", { id: venueId })}
                  </option>
                ) : null}
              </select>
            </label>

            {printSummariesEnabled && alertsHealth && keyStatus ? (
              <div style={{ ...staffFieldGroupStyle, flex: "1 1 340px" }} title={t("staff.installationKey.hint")}>
                <span style={staffLabelStyle}>{t("staff.installationKey.label")}</span>
                <StaffStatusChip
                  value={
                    keySave.state === "saved"
                      ? t("staff.installationKey.status.saved")
                      : t(`staff.installationKey.status.${keyStatus}`, { server: alertsHealth.server ?? "" })
                  }
                  tone={keySave.state === "saved" ? "ok" : INSTALLATION_KEY_STATUS_TONE[keyStatus]}
                  testId="staff-installation-key-status"
                />
                {editingKey ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void saveKey();
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 220px", minWidth: 0 }}
                  >
                    <input
                      type="password"
                      data-testid="staff-installation-key"
                      value={keyDraft}
                      autoComplete="off"
                      autoFocus={keyEditing}
                      placeholder={t("staff.installationKey.placeholder")}
                      onChange={(event) => {
                        setKeyDraft(event.target.value);
                        if (keySave.state !== "saving") setKeySave({ state: "idle" });
                      }}
                      style={staffFieldStyle}
                    />
                    <button
                      type="submit"
                      data-testid="staff-installation-key-save"
                      disabled={keyDraft.trim() === "" || keySave.state === "saving"}
                      style={staffCompactButton}
                    >
                      {t("staff.installationKey.save")}
                    </button>
                    {keyEditing ? (
                      <button
                        type="button"
                        data-testid="staff-installation-key-cancel"
                        onClick={() => {
                          setKeyEditing(false);
                          setKeyDraft("");
                          setKeySave({ state: "idle" });
                        }}
                        style={staffCompactButton}
                      >
                        {t("staff.installationKey.cancel")}
                      </button>
                    ) : null}
                  </form>
                ) : keyStatus === "saved" ? (
                  <button
                    type="button"
                    data-testid="staff-installation-key-change"
                    onClick={() => setKeyEditing(true)}
                    style={staffCompactButton}
                  >
                    {t("staff.installationKey.change")}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          {venueError ? (
            <StaffRowNote testId="staff-venue-error" tone="error" indent={false}>
              {venueError}
            </StaffRowNote>
          ) : null}
          {keySave.state === "failed" ? (
            <StaffRowNote testId="staff-installation-key-error" tone="error" indent={false}>
              {`${t("staff.installationKey.notSaved")}: ${keySave.error}`}
            </StaffRowNote>
          ) : null}

          <StaffDivider />

          <StaffRow label={t("staff.button.hardwareButton")}>
            <StaffToggle
              on={pttHardwareEnabled}
              onChange={setPttHardwareEnabled}
              testId="staff-ptt-hardware-toggle"
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
          </StaffRow>

          <StaffRow
            label={t("staff.print.toggle")}
            action={
              printSummariesEnabled ? (
                <>
                  {testPage !== "idle" ? (
                    <span data-testid="staff-print-test-page-result" style={staffResultStyle}>
                      {t(`staff.print.testPageResult.${testPage}`)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    data-testid="staff-print-test-page"
                    disabled={testPage === "sending"}
                    onClick={() => void printTestPage()}
                    style={staffCompactButton}
                  >
                    {t("staff.print.testPage")}
                  </button>
                </>
              ) : null
            }
          >
            <StaffToggle
              on={printSummariesEnabled}
              onChange={setPrintSummariesEnabled}
              testId="staff-print-summaries-toggle"
            />
            {printSummariesEnabled ? (
              <>
                <StaffStatusChip
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
          </StaffRow>
          {printSummariesEnabled ? (
            /* The test print is a sample letter and reply, printed through the same PDF path as real ones. */
            <div style={{ position: "absolute", top: 0, display: "none" }}>
              <LetterDocument
                ref={testPageRef}
                groups={letterFields(testLetter(t), t, i18n.language)}
                body={letterBody(testLetter(t), t, false)}
                meetingId={TEST_LETTER_MEETING_ID}
                qrUrl={new URL(meetingPath(TEST_LETTER_MEETING_ID), window.location.origin).toString()}
              />
              <LetterDocument
                ref={testReplyRef}
                title="REPLY"
                groups={replyFields(testReply(t, i18n.language), t)}
                body={t("staff.print.testReply.body")}
                meetingId={TEST_LETTER_MEETING_ID}
                qrUrl={new URL(meetingPath(TEST_LETTER_MEETING_ID), window.location.origin).toString()}
              />
            </div>
          ) : null}

          <StaffRow label={t("staff.splitAudio.toggle")}>
            <StaffToggle
              on={splitAudioEnabled}
              onChange={setSplitAudioEnabled}
              testId="staff-split-audio-toggle"
            />
          </StaffRow>

          <StaffRow label={t("staff.sidetone.label")}>
            <select
              data-testid="staff-sidetone-level"
              value={String(sidetoneLevel)}
              onChange={(event) => setSidetoneLevel(Number(event.target.value))}
              style={{ ...staffSelectStyle, flex: "0 1 auto" }}
            >
              {/* A level staff left between the steps (by hand, in storage) still shows. */}
              {[...new Set([...SIDETONE_LEVELS, sidetoneLevel])].sort((a, b) => a - b).map((level) => (
                <option key={level} value={String(level)} style={staffOptionStyle}>
                  {level > 0 ? `${Math.round(level * 100)} %` : t("staff.toggle.off")}
                </option>
              ))}
            </select>
          </StaffRow>
          <StaffRowNote>{t("staff.sidetone.note")}</StaffRowNote>

          {printSummariesEnabled && alertsHealth && alertsStatus ? (
            <>
              <StaffRow
                label={t("staff.alerts.label")}
                action={
                  keySaved ? (
                    <>
                      {testAlert.state === "sending" || testAlert.state === "sent" ? (
                        <span data-testid="staff-alerts-test-result" style={staffResultStyle}>
                          {t(`staff.alerts.testResult.${testAlert.state}`)}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        data-testid="staff-alerts-test"
                        disabled={!alertsHealth.venue || testAlert.state === "sending"}
                        onClick={() => void sendAlertTest()}
                        style={staffCompactButton}
                      >
                        {t("staff.alerts.test")}
                      </button>
                    </>
                  ) : null
                }
              >
                <StaffStatusChip
                  value={
                    alertsStatus === "on" && alertsHealth.venue
                      ? `${t("staff.alerts.status.on")} — ${alertsHealth.venue.name}`
                      : t(`staff.alerts.status.${alertsStatus}`)
                  }
                  tone={ALERTS_STATUS_TONE[alertsStatus]}
                  testId="staff-alerts-status"
                />
              </StaffRow>
              {testAlert.state === "failed" ? (
                <StaffRowNote testId="staff-alerts-test-result" tone="error">
                  {`${t("staff.alerts.testResult.failed")}: ${testAlert.error}`}
                </StaffRowNote>
              ) : null}
            </>
          ) : null}

          {showBridgeDetails ? (
            <>
              <StaffCollapsible label={t("staff.panels.details")} testId="staff-bridge-details">
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
            </>
          ) : null}
        </StaffPanel>

        <StaffPanel title={t("staff.panels.logging")} fullWidth compact testId="staff-logging-panel">
          {/* One row of switches, the categories under it. */}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div style={{ flex: "0 1 220px" }}>
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
            </div>
            <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
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
          </div>
          {devLogEnabled ? <ServerLogFailureNote /> : null}
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
