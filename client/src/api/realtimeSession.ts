import type {
  HumanInputRealtimeBootstrapRequest,
  HumanInputRealtimeCallRequest,
  RealtimeBootstrapResponse,
  RealtimeCallResponse,
} from "@shared/RealtimeSessionTypes";

function authHeaders(liveKey: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${liveKey}`,
  };
}

export async function bootstrapHumanInputRealtimeSession(
  body: HumanInputRealtimeBootstrapRequest,
  liveKey: string,
  signal?: AbortSignal
): Promise<RealtimeBootstrapResponse> {
  const res = await fetch("/api/realtime/bootstrap", {
    method: "POST",
    headers: authHeaders(liveKey),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Realtime bootstrap failed (${res.status})`);
  }
  return res.json();
}

export async function createHumanInputRealtimeCall(
  body: HumanInputRealtimeCallRequest,
  liveKey: string,
  signal?: AbortSignal
): Promise<RealtimeCallResponse> {
  const res = await fetch("/api/realtime/call", {
    method: "POST",
    headers: authHeaders(liveKey),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Realtime call failed (${res.status})`);
  }
  return res.json();
}
