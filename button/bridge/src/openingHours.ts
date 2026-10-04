/**
 * A venue's weekly opening window, evaluated in the venue's own time zone
 * (the Mac's clock zone doesn't matter). Mirrors the server's venue config.
 */

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export type OpeningHours = {
  days: Weekday[];
  /** "HH:MM", local to the venue. */
  from: string;
  to: string;
};

export function isOpen(hours: OpeningHours, timeZone: string, at: number): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";

  const weekday = part("weekday").toLowerCase().slice(0, 3) as Weekday;
  const time = `${part("hour")}:${part("minute")}`;
  return hours.days.includes(weekday) && time >= hours.from && time < hours.to;
}
