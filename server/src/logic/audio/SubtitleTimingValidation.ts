import type { MappedSentence } from "@shared/textUtils.js";

const MIN_ALLOWED_END_GAP_SEC = 0.75;
const MAX_ALLOWED_END_GAP_SEC = 3;
const ALLOWED_END_GAP_RATIO = 0.2;

export interface SubtitleTimingValidationResult {
    valid: boolean;
    reason?: string;
}

export function validateSentenceTimingsAgainstDuration(
    sentences: MappedSentence[],
    durationSec: number
): SubtitleTimingValidationResult {
    if (sentences.length === 0) {
        return { valid: false, reason: "no sentence timings" };
    }

    let previousStart = -Infinity;
    let previousEnd = -Infinity;

    for (const [index, sentence] of sentences.entries()) {
        if (!Number.isFinite(sentence.start) || !Number.isFinite(sentence.end)) {
            return { valid: false, reason: `sentence ${index} has non-finite timing` };
        }

        if (sentence.start < 0 || sentence.end < sentence.start) {
            return { valid: false, reason: `sentence ${index} has invalid timing order` };
        }

        if (sentence.start < previousStart || sentence.end < previousEnd) {
            return { valid: false, reason: `sentence ${index} moves backwards in time` };
        }

        previousStart = sentence.start;
        previousEnd = sentence.end;
    }

    if (!Number.isFinite(durationSec) || durationSec <= 0) {
        return { valid: true };
    }

    const lastEnd = sentences[sentences.length - 1]!.end;
    const allowedEndGap = Math.min(
        MAX_ALLOWED_END_GAP_SEC,
        Math.max(MIN_ALLOWED_END_GAP_SEC, durationSec * ALLOWED_END_GAP_RATIO)
    );

    if (durationSec - lastEnd > allowedEndGap) {
        return {
            valid: false,
            reason: `last subtitle ends ${Number((durationSec - lastEnd).toFixed(3))}s before audio ends`
        };
    }

    if (lastEnd - durationSec > allowedEndGap) {
        return {
            valid: false,
            reason: `last subtitle ends ${Number((lastEnd - durationSec).toFixed(3))}s after audio ends`
        };
    }

    return { valid: true };
}
