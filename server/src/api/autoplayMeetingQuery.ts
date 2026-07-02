import { getGlobalOptions } from "@logic/GlobalOptions.js";

/**
 * Cheap Mongo pre-filter for kiosk autoplay candidates.
 *
 * TEMPORARY — see docs/meeting-complete-flag-plan.md. This duplicates cap/summary
 * rules from replayManifest in aggregation form. Replace with `{ meetingComplete: true }`
 * once that flag is written at conclude + backfilled.
 */
export function buildAutoplayBaseMatch(language?: string): Record<string, unknown> {
    const { autoplayEarliestMeetingDate } = getGlobalOptions();
    const filter: Record<string, unknown> = {
        summary: { $exists: true, $ne: null },
        date: { $gte: autoplayEarliestMeetingDate },
        audio: { $exists: true, $not: { $size: 0 } },
    };
    if (language) {
        filter.language = language;
    }
    return filter;
}

/**
 * Aggregation pipeline: base match → cap-index eligibility → random sample.
 *
 * Eligibility mirrors `computeCapIndex` + "capped last message is summary with audio id
 * listed on the meeting". Does not replicate `truncateToAvailableAudio` mid-conversation;
 * `isCompleteReplayManifest` remains the final gate after sample.
 */
export function buildAutoplaySamplePipeline(language?: string): Record<string, unknown>[] {
    return [
        { $match: buildAutoplayBaseMatch(language) },
        {
            $addFields: {
                _convLen: { $size: { $ifNull: ["$conversation", []] } },
            },
        },
        {
            $addFields: {
                _capIndex: {
                    $let: {
                        vars: {
                            len: "$_convLen",
                            lastIdx: { $subtract: ["$_convLen", 1] },
                            raw: {
                                $ifNull: [
                                    "$maximumPlayedIndex",
                                    { $subtract: ["$_convLen", 1] },
                                ],
                            },
                        },
                        in: {
                            $cond: {
                                if: { $lte: ["$$len", 0] },
                                then: -1,
                                else: { $max: [-1, { $min: ["$$raw", "$$lastIdx"] }] },
                            },
                        },
                    },
                },
            },
        },
        {
            $addFields: {
                _cappedLast: { $arrayElemAt: ["$conversation", "$_capIndex"] },
            },
        },
        {
            $match: {
                _capIndex: { $gte: 0 },
                "_cappedLast.type": "summary",
                $expr: {
                    $and: [
                        { $gt: [{ $strLenCP: { $ifNull: ["$_cappedLast.id", ""] } }, 0] },
                        { $in: ["$_cappedLast.id", { $ifNull: ["$audio", []] }] },
                    ],
                },
            },
        },
        { $project: { _convLen: 0, _capIndex: 0, _cappedLast: 0 } },
        { $sample: { size: 1 } },
    ];
}
