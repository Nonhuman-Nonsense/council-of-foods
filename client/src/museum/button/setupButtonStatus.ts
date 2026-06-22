import type { ButtonBridgeHealthState, UsbPortInfo } from "./health";
import type { ButtonTransportStatus } from "./transport";

export type BridgeDaemonStatus = "checking" | "running" | "notRunning" | "error";
export type BridgeAppStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "unavailable";
export type UsbButtonStatus =
  | "connected"
  | "checking"
  | "notDetected"
  | "wrongDevice"
  | "unavailable";

export function getBridgeDaemonStatus(health: ButtonBridgeHealthState): BridgeDaemonStatus {
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

export function getBridgeAppStatus(
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

export function getUsbButtonStatus(health: ButtonBridgeHealthState): UsbButtonStatus {
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

export function getSetupBridgeDetailLines(
  health: ButtonBridgeHealthState,
): string[] {
  if (health.status !== "running") {
    return [];
  }

  const lines: string[] = [];
  lines.push(`Bridge version ${health.version}`);

  if (health.expectedVendorId) {
    lines.push(`Looking for USB vendor ${health.expectedVendorId} (Adafruit boards)`);
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

export function getSetupBridgeLogHint(): string {
  return "/var/log/council-button-bridge.log";
}
