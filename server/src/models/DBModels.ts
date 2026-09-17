import type { Audio, BaseMeeting } from '@shared/ModelTypes.js';
import type { UsageEvent, UsageMeasures } from '@shared/UsageTypes.js';
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

/** Latest reading of one room power plug; `_id` is `<venueId>|<deviceId>`. */
export interface StoredRoomPower extends Document {
    _id: string;
    venueId: string;
    deviceId: string;
    label: string;
    watts: number;
    /** Accumulated energy since first report, Wh. */
    energyWh: number;
    /** The plug's counter at the last report, to accumulate deltas across its resets. */
    lastCounterWh: number;
    updatedAt: Date;
}

/** Running sum of raw usage for one scope ("global" or "venue:<id>") and model. */
export interface UsageTotals extends Document {
    _id: string;
    scope: string;
    provider: string;
    model: string;
    requests: number;
    measures: UsageMeasures;
}

export type SubtitleTimingType = 'whisper' | 'inworld' | 'elevenlabs' | 'estimated' | undefined;
export interface StoredAudio extends Audio, Document {
    subtitleTimingType?: SubtitleTimingType;
}

export interface Counter extends Document {
    _id: string;
    seq: number;
}
