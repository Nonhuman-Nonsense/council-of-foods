import { councilFetch } from "./http";
import { httpErrorMessage } from "./httpErrorMessage";

export async function fetchAutoplayMeetingId(language?: string): Promise<number> {
  const query = language ? `?language=${encodeURIComponent(language)}` : "";
  const res = await councilFetch(`/api/autoplay${query}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const message = await httpErrorMessage(res, `Autoplay meeting failed (${res.status})`);
    throw new Error(message);
  }
  const data = (await res.json()) as { meetingId: number };
  return data.meetingId;
}
