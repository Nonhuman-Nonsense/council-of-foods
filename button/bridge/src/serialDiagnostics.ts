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

export type SerialDiagnostics = {
  state: "connected" | "disconnected" | "probing";
  path: string | null;
  detail: SerialDetail;
  message: string;
  expectedVendorId: string | null;
  scannedPorts: UsbPortInfo[];
};

export function createDisconnectedDiagnostics(
  expectedVendorId: string | null,
  scannedPorts: UsbPortInfo[],
  detail: Extract<SerialDetail, "no_device" | "probe_failed" | "shutdown">,
  message: string,
  path: string | null = null,
): SerialDiagnostics {
  return {
    state: "disconnected",
    path,
    detail,
    message,
    expectedVendorId,
    scannedPorts,
  };
}

export function createProbingDiagnostics(
  expectedVendorId: string | null,
  scannedPorts: UsbPortInfo[],
  path: string,
): SerialDiagnostics {
  return {
    state: "probing",
    path,
    detail: "probing",
    message: `Checking USB device at ${path}`,
    expectedVendorId,
    scannedPorts,
  };
}

export function createConnectedDiagnostics(
  expectedVendorId: string | null,
  scannedPorts: UsbPortInfo[],
  path: string,
): SerialDiagnostics {
  return {
    state: "connected",
    path,
    detail: "connected",
    message: `Council button connected at ${path}`,
    expectedVendorId,
    scannedPorts,
  };
}
