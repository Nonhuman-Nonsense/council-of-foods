import type { CreateMeetingBody } from "@shared/SocketTypes.js";
import { councilFetch, HttpStatusError } from "./http";
import { httpErrorBody } from "./httpErrorMessage";

export async function createMeeting(body: CreateMeetingBody): Promise<{ meetingId: number, liveKey: string }> {
  const res = await councilFetch("/api/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const { message, errorKey } = await httpErrorBody(res, `Create meeting failed (${res.status})`);
    throw new HttpStatusError(res.status, message, errorKey);
  }
  const data = await res.json() as { meetingId: string | number; liveKey: string };
  return { meetingId: Number(data.meetingId), liveKey: data.liveKey };
}
