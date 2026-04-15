import type { ResumeMeetingResponse } from "@shared/SocketTypes";

export async function resumeMeeting({
  meetingId,
}: {
  meetingId: number;
}): Promise<ResumeMeetingResponse> {
  const res = await fetch(`/api/meetings/${meetingId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Resume meeting failed (${res.status})`);
  }
  return await res.json() as ResumeMeetingResponse;
}
