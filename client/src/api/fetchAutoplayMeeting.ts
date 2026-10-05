import { councilFetch } from "./http";
import { httpErrorMessage } from "./httpErrorMessage";
import { getVenueId } from "@/settings/councilSettings";

/** A random completed meeting to replay; an installation with a venue gets one held there. */
export async function fetchAutoplayMeetingId(language?: string): Promise<number> {
  const params = new URLSearchParams();
  if (language) params.set("language", language);
  const venueId = getVenueId();
  if (venueId) params.set("venue", venueId);
  const query = params.size ? `?${params}` : "";
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
