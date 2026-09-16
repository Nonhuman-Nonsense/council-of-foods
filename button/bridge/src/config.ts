import { existsSync } from "node:fs";
import path from "node:path";
import { BUTTON_BAUD_RATE } from "../../../shared/buttonProtocol.js";
import { MOCK_PRINTER_MODES, type MockPrinterMode } from "./printer.js";

export type BridgeConfig = {
  host: string;
  port: number;
  baudRate: number;
  serialPath: string | null;
  serialVendorId: string | null;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
  mockSerial: boolean;
  /** Accept print jobs on /v1/print. */
  printEnabled: boolean;
  /** Holds pending/ and done/. Relative paths resolve against the working directory. */
  printSpoolDir: string;
  /** CUPS queue name; null prints to the system default printer. */
  printer: string | null;
  /** Use the mock printer instead of `lp`; "fail" starts it refusing every job. */
  mockPrinter: MockPrinterMode | null;
  printMaxBytes: number;
  printRetryBaseMs: number;
  printRetryMaxMs: number;
  printStatusIntervalMs: number;
  printNotPrintingAfterMs: number;
  /** Council server that emails printer alerts; alerts are off without both. */
  serverUrl: string | null;
  serverKey: string | null;
  /** Holds BRIDGE_SERVER_URL / BRIDGE_SERVER_KEY; kept out of the plist, which installs rewrite. */
  alertsFile: string;
  alertGraceMs: number;
  alertReminderMs: number;
  alertOpeningReminderGapMs: number;
  alertTickMs: number;
  alertVenueRefreshMs: number;
  alertRetryBaseMs: number;
  alertRetryMaxMs: number;
  alertTestIntervalMs: number;
};

function readInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readOptionalString(value: string | undefined): string | null {
  if (!value || value.trim() === "") return null;
  return value.trim();
}

function readBool(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function readMockPrinter(value: string | undefined): MockPrinterMode | null {
  const mode = value?.trim().toLowerCase();
  if ((MOCK_PRINTER_MODES as readonly string[]).includes(mode ?? "")) return mode as MockPrinterMode;
  return readBool(value) ? "ok" : null;
}

export function loadConfig(): BridgeConfig {
  const alertsFile = path.resolve(readOptionalString(process.env.BRIDGE_ALERTS_FILE) ?? "alerts.env");
  if (existsSync(alertsFile)) {
    // Real environment variables win over the file.
    process.loadEnvFile(alertsFile);
  }
  return {
    host: process.env.BUTTON_BRIDGE_HOST?.trim() || "127.0.0.1",
    port: readInt(process.env.BUTTON_BRIDGE_PORT, 8765),
    baudRate: readInt(process.env.BUTTON_BAUD_RATE, BUTTON_BAUD_RATE),
    serialPath: readOptionalString(process.env.BUTTON_SERIAL_PATH),
    serialVendorId: readOptionalString(process.env.BUTTON_SERIAL_VENDOR_ID) ?? "2341",
    reconnectBaseMs: readInt(process.env.BUTTON_RECONNECT_BASE_MS, 500),
    reconnectMaxMs: readInt(process.env.BUTTON_RECONNECT_MAX_MS, 10_000),
    mockSerial: readBool(process.env.BUTTON_MOCK_SERIAL),
    printEnabled:
      process.env.BRIDGE_PRINT_ENABLED === undefined || readBool(process.env.BRIDGE_PRINT_ENABLED),
    printSpoolDir: path.resolve(
      readOptionalString(process.env.BRIDGE_PRINT_SPOOL_DIR) ?? ".print-spool",
    ),
    printer: readOptionalString(process.env.BRIDGE_PRINTER),
    mockPrinter: readMockPrinter(process.env.BRIDGE_MOCK_PRINTER),
    printMaxBytes: 20 * 1024 * 1024,
    printRetryBaseMs: 5_000,
    printRetryMaxMs: 5 * 60_000,
    printStatusIntervalMs: 30_000,
    printNotPrintingAfterMs: 10 * 60_000,
    serverUrl: readOptionalString(process.env.BRIDGE_SERVER_URL),
    serverKey: readOptionalString(process.env.BRIDGE_SERVER_KEY),
    alertsFile,
    alertGraceMs: 2 * 60_000,
    alertReminderMs: 4 * 60 * 60_000,
    alertOpeningReminderGapMs: 60 * 60_000,
    alertTickMs: 30_000,
    alertVenueRefreshMs: 60 * 60_000,
    alertRetryBaseMs: 30_000,
    alertRetryMaxMs: 10 * 60_000,
    alertTestIntervalMs: 60_000,
  };
}
