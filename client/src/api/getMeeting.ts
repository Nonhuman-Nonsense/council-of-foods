import type { Meeting } from "@shared/ModelTypes";
import { councilFetch, HttpStatusError } from "./http";
import { httpErrorMessage } from "./httpErrorMessage";

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
  const res = await councilFetch(`/api/meetings/${meetingId}`, {
    method: "GET",
    headers,
    signal,
  });
  if (!res.ok) {
    const message = await httpErrorMessage(res, `Get meeting failed (${res.status})`);
    throw new HttpStatusError(res.status, message);
  }
  return await res.json() as Meeting;
}
