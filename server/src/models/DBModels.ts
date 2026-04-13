import type { Audio, Meeting } from '@shared/ModelTypes.js';
import type { Document } from "mongodb";

// Re-using local interfaces or defining them here if they need to be shared broadly
// For now, we import what we can.

export interface StoredMeeting extends Meeting, Document {}

export interface StoredAudio extends Audio, Document {}

export interface Counter extends Document {
    _id: string;
    seq: number;
}
