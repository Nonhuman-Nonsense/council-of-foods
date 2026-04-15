import type { Audio, BaseMeeting } from '@shared/ModelTypes.js';
import type { Document } from "mongodb";

// Re-using local interfaces or defining them here if they need to be shared broadly
// For now, we import what we can.

// Additional fields for the stored meeting, never sent to the client
export interface StoredMeeting extends BaseMeeting, Document {
    creatorKey: string;
}

export interface StoredAudio extends Audio, Document {}

export interface Counter extends Document {
    _id: string;
    seq: number;
}
