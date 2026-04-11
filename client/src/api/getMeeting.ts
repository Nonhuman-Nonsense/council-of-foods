import type { Meeting } from "@shared/ModelTypes";

export async function getMeeting({
  meetingId,
  creatorKey,
  signal,
}: {
  meetingId: number;
  creatorKey: string;
  signal?: AbortSignal;
}): Promise<Meeting> {
  const res = await fetch(`/api/meetings/${meetingId}`, {
    method: "GET",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${creatorKey}` },
    signal,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Get meeting failed (${res.status})`);
  }
  const meeting = await res.json() as Meeting;
  return meeting;
}
