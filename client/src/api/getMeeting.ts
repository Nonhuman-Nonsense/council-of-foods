import type { Meeting } from "@shared/ModelTypes";

export async function getMeeting({
  meetingId,
  liveKey,
  signal,
}: {
  meetingId: number;
  liveKey?: string | null;
  signal?: AbortSignal;
}): Promise<Meeting> {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (liveKey) {
    headers["Authorization"] = `Bearer ${liveKey}`;
  }
  const res = await fetch(`/api/meetings/${meetingId}`, {
    method: "GET",
    headers,
    signal,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Get meeting failed (${res.status})`);
  }
  return await res.json() as Meeting;
}
