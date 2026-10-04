import { councilFetch } from "./http";

/** A venue an installation can run at, as the council server lists it (no addresses). */
export type Venue = { id: string; name: string };

export async function fetchVenues(): Promise<Venue[]> {
  const res = await councilFetch("/api/venues");
  if (!res.ok) throw new Error(`Venues unavailable (${res.status})`);
  const { venues } = (await res.json()) as { venues: Venue[] };
  return venues;
}
