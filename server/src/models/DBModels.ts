import type { Audio, BaseMeeting } from '@shared/ModelTypes.js';
import type { UsageEvent } from '@shared/UsageTypes.js';
import type { Document } from "mongodb";

// Re-using local interfaces or defining them here if they need to be shared broadly
// For now, we import what we can.

// Additional fields for the stored meeting, never sent to the client
export interface StoredMeeting extends BaseMeeting, Document {
    liveKey: string;
    /** Venue the meeting ran at, if staff chose one. Tags the meeting's AI usage. */
    venueId?: string;
}

export interface StoredUsageEvent extends UsageEvent, Document {}

/** Latest reading of one room power plug at one venue; `_id` is `<venueId>|<plug>`. */
export interface StoredRoomPower extends Document {
    _id: string;
    venueId: string;
    plug: number;
    /** The Shelly reporting as this plug number. */
    deviceId: string;
    label: string;
    watts: number;
    /** Accumulated energy since first report, Wh. */
    energyWh: number;
    /** The plug's counter at the last report, to accumulate deltas across its resets. */
    lastCounterWh: number;
    /** The plug's uptime at the last report, to tell a restart (and counter reset) for certain. */
    lastUptimeSeconds?: number;
    /** Energy the last report added, Wh; what that report adds to its hour. */
    lastDeltaWh: number;
    updatedAt: Date;
}

/** One plug's electricity at a venue in one hour (UTC); `_id` is `<venueId>|<plug>|<hour ISO>`. */
export interface StoredRoomPowerHour extends Document {
    _id: string;
    venueId: string;
    plug: number;
    /** The Shelly reporting as this plug number at its latest report in this hour. */
    deviceId: string;
    /** The plug's label at its latest report in this hour. */
    label: string;
    /** Start of the hour. */
    hour: Date;
    /** Energy used in this hour, Wh. */
    energyWh: number;
    maxWatts: number;
    /** Reports received in this hour; few or none means the plug was offline. */
    reports: number;
}

export type SubtitleTimingType = 'whisper' | 'inworld' | 'elevenlabs' | 'estimated' | undefined;
export interface StoredAudio extends Audio, Document {
    subtitleTimingType?: SubtitleTimingType;
}

export interface Counter extends Document {
    _id: string;
    seq: number;
}
