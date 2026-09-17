import { config } from "@root/src/config.js";
import type { Venue } from "@models/Venues.js";

/**
 * The venue an installation runs at (`COUNCIL_VENUES`). Staff pick it on #staff; it tags
 * meetings and realtime sessions for the footprint meter, groups room power plugs, and
 * decides who hears about the printer.
 */

const VENUE_ID = /^[a-z0-9-]{1,64}$/;

export function findVenue(id: string): Venue | undefined {
    return config.COUNCIL_VENUES?.find((venue) => venue.id === id);
}

/**
 * A venue id worth tagging usage with. When venues are configured it must be one of them;
 * without any (local development) any well-formed id is accepted. Anything else is dropped,
 * never an error: a stale choice on an installation must not stop a meeting.
 */
export function resolveVenueId(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    const id = value.trim();
    if (!VENUE_ID.test(id)) return undefined;
    if (config.COUNCIL_VENUES?.length) {
        return findVenue(id) ? id : undefined;
    }
    return id;
}

/** What may be shown publicly about venues: no addresses. */
export function publicVenues(): { id: string; name: string }[] {
    return (config.COUNCIL_VENUES ?? []).map(({ id, name }) => ({ id, name }));
}
