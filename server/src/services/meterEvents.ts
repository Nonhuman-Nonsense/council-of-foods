import { EventEmitter } from "node:events";
import type { StoredMeeting } from "@models/DBModels.js";
import type { MeetingProgress, RoomPowerReading } from "@shared/MeterTypes.js";
import type { UsageEvent } from "@shared/UsageTypes.js";

/** What the footprint meter follows live: AI usage, plug readings, and how far meetings have played. */
export const meterEvents = new EventEmitter<{
    usage: [UsageEvent];
    roomPower: [RoomPowerReading];
    meetingProgress: [MeetingProgress];
}>();

/** Tells meters how far a meeting has played, so its usage is counted as the visitor sees it. */
export function announceMeetingProgress(meeting: Pick<StoredMeeting, "_id" | "venueId" | "maximumPlayedIndex">): void {
    if (meeting.maximumPlayedIndex == null) return;
    meterEvents.emit("meetingProgress", {
        meetingId: meeting._id,
        ...(meeting.venueId ? { venueId: meeting.venueId } : {}),
        maximumPlayedIndex: meeting.maximumPlayedIndex,
    });
}
