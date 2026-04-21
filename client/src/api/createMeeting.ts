import type { CreateMeetingBody } from "@shared/SocketTypes.js";
import { httpErrorMessage } from "./httpErrorMessage";

export async function createMeeting(body: CreateMeetingBody): Promise<{ meetingId: number, liveKey: string }> {
  const res = await fetch("/api/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const message = await httpErrorMessage(res, `Create meeting failed (${res.status})`);
    throw new Error(message);
  }
  const data = await res.json() as { meetingId: string | number; liveKey: string };
  return { meetingId: Number(data.meetingId), liveKey: data.liveKey };
}
