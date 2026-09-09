import type { ClientErrorKey, ResumeMeetingResponse } from "@shared/SocketTypes";
import { httpErrorBody } from "./httpErrorMessage";
import { councilFetch, HttpStatusError } from "./http";

/** Typed error for `PUT /api/meetings/:id` so callers can branch on status code. */
export class ResumeMeetingError extends HttpStatusError {
  constructor(status: number, message: string, errorKey?: ClientErrorKey) {
    super(status, message, errorKey);
    this.name = "ResumeMeetingError";
  }
}

export async function resumeMeeting({
  meetingId,
}: {
  meetingId: number;
}): Promise<ResumeMeetingResponse> {
  const res = await councilFetch(`/api/meetings/${meetingId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const { message, errorKey } = await httpErrorBody(res, `Resume meeting failed (${res.status})`);
    throw new ResumeMeetingError(res.status, message, errorKey);
  }
  return (await res.json()) as ResumeMeetingResponse;
}
