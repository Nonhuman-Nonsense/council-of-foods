import type { Meeting } from "@shared/ModelTypes";

export async function getMeeting({
  meetingId,
  creatorKey,
  signal,
}: {
  meetingId: number;
  creatorKey?: string | null;
  signal?: AbortSignal;
}): Promise<Meeting> {
  const headers: HeadersInit = { "Content-Type": "application/json" };
  if (creatorKey) {
    headers["Authorization"] = `Bearer ${creatorKey}`;
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
