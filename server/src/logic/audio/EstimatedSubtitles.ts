import { splitSentences, type MappedSentence } from "@shared/textUtils.js";
import type { Message } from "./AudioTypes.js";

const MIN_ESTIMATED_SENTENCE_DURATION_SEC = 0.8;

export function buildEstimatedSentenceTimings(message: Message, durationSec: number): MappedSentence[] {
    const sentences = getSentencesForTiming(message);
    if (sentences.length === 0 || durationSec <= 0) {
        return [];
    }

    const weights = sentences.map(sentence => Math.max(sentence.length, 1));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) {
        return [];
    }

    const rawDurations = weights.map(weight => (durationSec * weight) / totalWeight);
    const normalizedDurations = [...rawDurations];
    const rawTotal = rawDurations.reduce((sum, segmentDuration) => sum + segmentDuration, 0);
    normalizedDurations[normalizedDurations.length - 1] += durationSec - rawTotal;

    const segmentDurations = applyMinimumSegmentDurations(
        normalizedDurations,
        durationSec,
        MIN_ESTIMATED_SENTENCE_DURATION_SEC
    );

    const estimatedSentences: MappedSentence[] = [];
    let currentTime = 0;

    for (let index = 0; index < sentences.length; index++) {
        const start = currentTime;
        const end = currentTime + segmentDurations[index];
        estimatedSentences.push({
            text: sentences[index],
            start,
            end
        });
        currentTime = end;
    }

    return estimatedSentences;
}

function getSentencesForTiming(message: Message): string[] {
    return message.sentences.length > 0 ? message.sentences : splitSentences(message.text);
}

function applyMinimumSegmentDurations(rawDurations: number[], durationSec: number, minSec: number): number[] {
    const segmentCount = rawDurations.length;
    if (segmentCount === 0 || durationSec <= 0) {
        return [];
    }

    if (minSec <= 0) {
        return [...rawDurations];
    }

    if (segmentCount * minSec > durationSec) {
        return Array.from({ length: segmentCount }, () => durationSec / segmentCount);
    }

    const adjustedDurations = rawDurations.map(duration => Math.max(duration, minSec));
    let adjustedTotal = adjustedDurations.reduce((sum, duration) => sum + duration, 0);

    if (adjustedTotal > durationSec + 1e-9) {
        const aboveFloorDurations = adjustedDurations.map(duration => duration - minSec);
        const aboveFloorTotal = aboveFloorDurations.reduce((sum, duration) => sum + duration, 0);

        if (aboveFloorTotal < 1e-12) {
            return Array.from({ length: segmentCount }, () => durationSec / segmentCount);
        }

        const distributableDuration = durationSec - segmentCount * minSec;
        for (let index = 0; index < segmentCount; index++) {
            adjustedDurations[index] = minSec + (aboveFloorDurations[index] * distributableDuration) / aboveFloorTotal;
        }
        adjustedTotal = adjustedDurations.reduce((sum, duration) => sum + duration, 0);
    }

    if (adjustedTotal < durationSec - 1e-9) {
        adjustedDurations[segmentCount - 1] += durationSec - adjustedTotal;
    }

    return adjustedDurations;
}
