import type { Audio, BaseMeeting } from '@shared/ModelTypes.js';
import type { UsageEvent, UsageMeasures } from '@shared/UsageTypes.js';
import type { Document } from "mongodb";

// Re-using local interfaces or defining them here if they need to be shared broadly
// For now, we import what we can.

// Additional fields for the stored meeting, never sent to the client
export interface StoredMeeting extends BaseMeeting, Document {
    liveKey: string;
    /** Installation the meeting ran on, if staff configured one. Tags the meeting's AI usage. */
    installationId?: string;
}

export interface StoredUsageEvent extends UsageEvent, Document {}

/** Running sum of raw usage for one scope ("global" or "installation:<id>") and model. */
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
