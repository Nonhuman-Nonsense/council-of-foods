import { BUTTON_BAUD_RATE } from "../../../shared/buttonProtocol.js";

export type BridgeConfig = {
  host: string;
  port: number;
  baudRate: number;
  serialPath: string | null;
  serialVendorId: string | null;
  reconnectBaseMs: number;
  reconnectMaxMs: number;
  mockSerial: boolean;
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

export function loadConfig(): BridgeConfig {
  return {
    host: process.env.BUTTON_BRIDGE_HOST?.trim() || "127.0.0.1",
    port: readInt(process.env.BUTTON_BRIDGE_PORT, 8765),
    baudRate: readInt(process.env.BUTTON_BAUD_RATE, BUTTON_BAUD_RATE),
    serialPath: readOptionalString(process.env.BUTTON_SERIAL_PATH),
    serialVendorId: readOptionalString(process.env.BUTTON_SERIAL_VENDOR_ID) ?? "2341",
    reconnectBaseMs: readInt(process.env.BUTTON_RECONNECT_BASE_MS, 500),
    reconnectMaxMs: readInt(process.env.BUTTON_RECONNECT_MAX_MS, 10_000),
    mockSerial: readBool(process.env.BUTTON_MOCK_SERIAL),
  };
}
