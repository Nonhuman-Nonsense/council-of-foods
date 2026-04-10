import type { Character } from "@shared/ModelTypes";

export interface CreateMeetingBody {
  topic: string;
  characters: Character[];
  language: string;
}

export async function createMeeting(body: CreateMeetingBody): Promise<{ meetingId: number }> {
  const res = await fetch("/api/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Create meeting failed (${res.status})`);
  }
  return res.json() as Promise<{ meetingId: number }>;
}
