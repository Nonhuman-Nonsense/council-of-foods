import { DEFAULT_BUTTON_BRIDGE_HEALTH_URL } from "./config";

export type UsbPortInfo = {
  path: string;
  vendorId?: string;
  productId?: string;
};

export type SerialDetail =
  | "connected"
  | "no_device"
  | "probe_failed"
  | "probing"
  | "shutdown";

export type ButtonBridgeHealthState =
  | { status: "checking" }
  | {
      status: "running";
      serial: "connected" | "disconnected" | "probing";
      path: string | null;
      version: string;
      serialDetail: SerialDetail;
      serialMessage: string;
      expectedVendorId: string | null;
      scannedPorts: UsbPortInfo[];
    }
  | { status: "not_running" }
  | { status: "error"; message: string };

type ButtonBridgeHealthResponse = {
  ok?: boolean;
  serial?: string;
  path?: string | null;
  version?: string;
  serialDetail?: SerialDetail;
  serialMessage?: string;
  expectedVendorId?: string | null;
  scannedPorts?: UsbPortInfo[];
};

function normalizeSerialState(
  value: string | undefined,
): "connected" | "disconnected" | "probing" {
  if (value === "connected" || value === "probing") return value;
  return "disconnected";
}

export async function fetchButtonBridgeHealth(
  url = DEFAULT_BUTTON_BRIDGE_HEALTH_URL,
): Promise<ButtonBridgeHealthState> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) {
      return { status: "error", message: `HTTP ${response.status}` };
    }
    const body = (await response.json()) as ButtonBridgeHealthResponse;
    if (!body.ok) {
      return { status: "error", message: "Bridge health not ok" };
    }
    return {
      status: "running",
      serial: normalizeSerialState(body.serial),
      path: body.path ?? null,
      version: body.version ?? "unknown",
      serialDetail: body.serialDetail ?? "shutdown",
      serialMessage: body.serialMessage ?? "",
      expectedVendorId: body.expectedVendorId ?? null,
      scannedPorts: body.scannedPorts ?? [],
    };
  } catch {
    return { status: "not_running" };
  }
}
