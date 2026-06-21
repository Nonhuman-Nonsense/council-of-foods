import { DEFAULT_BUTTON_BRIDGE_HEALTH_URL } from "@/button/config";

export type ButtonBridgeHealthState =
  | { status: "checking" }
  | { status: "running"; serial: string; path: string | null; version: string }
  | { status: "not_running" }
  | { status: "error"; message: string };

type ButtonBridgeHealthResponse = {
  ok?: boolean;
  serial?: string;
  path?: string | null;
  version?: string;
};

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
      serial: body.serial ?? "unknown",
      path: body.path ?? null,
      version: body.version ?? "unknown",
    };
  } catch {
    return { status: "not_running" };
  }
}
