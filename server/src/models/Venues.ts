import { z } from "zod";

/**
 * Places an installation can be shown. A venue owns who is emailed about the
 * installation's printer and when they may be reminded; staff pick the current
 * venue on the installation, so alerts can only ever reach addresses listed here.
 */

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

const TimeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM");

const TimeZone = z.string().refine((zone) => {
    try {
        new Intl.DateTimeFormat("en-GB", { timeZone: zone });
        return true;
    } catch {
        return false;
    }
}, "unknown time zone");

export const VenueSchema = z.object({
    id: z.string().regex(/^[a-z0-9-]+$/, "lowercase letters, digits and dashes"),
    name: z.string().min(1),
    alertEmails: z.array(z.email()).min(1),
    timezone: TimeZone,
    /** One weekly window. Holidays and closed weeks are deliberately not modelled. */
    openingHours: z.object({
        days: z.array(z.enum(WEEKDAYS)).min(1),
        from: TimeOfDay,
        to: TimeOfDay,
    }).refine((hours) => hours.from < hours.to, "from must be before to"),
    /**
     * The room power plugs here now, by the number marked on each. Moving an installation is
     * moving its plugs to the new venue here; what they measured before stays with the old one.
     */
    plugs: z.array(z.object({
        plug: z.number().int().positive(),
        /** What it powers, as shown on the meter: "Projector". */
        label: z.string().trim().min(1).max(64),
    })).optional(),
});

export type Venue = z.infer<typeof VenueSchema>;

function allUnique(values: unknown[]): boolean {
    return new Set(values).size === values.length;
}

export const VenueListSchema = z.array(VenueSchema)
    .refine((venues) => allUnique(venues.map((venue) => venue.id)), "venue ids must be unique")
    .refine(
        (venues) => allUnique(venues.flatMap((venue) => (venue.plugs ?? []).map((p) => p.plug))),
        "a plug number can only be at one venue, once",
    );

/** `COUNCIL_VENUES`: a JSON array of venues. */
export const VenuesEnv = z.string().transform((raw, ctx) => {
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        ctx.addIssue({ code: "custom", message: "COUNCIL_VENUES is not valid JSON" });
        return z.NEVER;
    }
}).pipe(VenueListSchema);

/** `staff@museum.org` → `s***@museum.org`: enough for staff to recognise, not to harvest. */
export function maskEmail(email: string): string {
    const at = email.indexOf("@");
    if (at <= 0) return "***";
    return `${email[0]}***${email.slice(at)}`;
}
