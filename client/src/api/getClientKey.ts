import type { ClientKeyResponse } from "@shared/SocketTypes";

export async function getClientKey({
  language,
  creatorKey,
  signal,
}: {
  language: string;
  creatorKey: string;
  signal?: AbortSignal;
}): Promise<ClientKeyResponse> {
  const res = await fetch("/api/clientkey", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${creatorKey}`,
    },
    body: JSON.stringify({ language }),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Client key request failed (${res.status})`);
  }
  return res.json();
}
