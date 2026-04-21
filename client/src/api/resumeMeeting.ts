import type { ResumeMeetingResponse } from "@shared/SocketTypes";

/** Typed error for `PUT /api/meetings/:id` so callers can branch on status code. */
export class ResumeMeetingError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ResumeMeetingError";
    this.status = status;
  }
}

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
    let message = `Resume meeting failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && typeof body.message === "string" && body.message.length > 0) {
        message = body.message;
      }
    } catch {
      // response had no JSON body; fall back to the status-based message
    }
    throw new ResumeMeetingError(res.status, message);
  }
  return (await res.json()) as ResumeMeetingResponse;
}
