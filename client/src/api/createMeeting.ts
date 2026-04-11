import type { CreateMeetingBody } from "@shared/SocketTypes.js";

export async function createMeeting(body: CreateMeetingBody): Promise<{ meetingId: number, creatorKey: string }> {
  const res = await fetch("/api/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Create meeting failed (${res.status})`);
  }
  return res.json() as Promise<{ meetingId: number, creatorKey: string }>;
}
