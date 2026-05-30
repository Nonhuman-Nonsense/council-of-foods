export interface Word {
    word: string;
    start: number;
    end: number;
}

export interface MappedSentence {
    text: string;
    start: number;
    end: number;
}

interface NormalizedWord extends Word {
    token: string;
}

const PROTECTED_PERIOD = "<COF_PERIOD>";

function protectSentenceInternalPeriods(text: string): string {
    return text.replace(/\bvs\.(?=\s|$)/gi, (match) => match.replace(".", PROTECTED_PERIOD));
}

function restoreSentenceInternalPeriods(text: string): string {
    return text.replaceAll(PROTECTED_PERIOD, ".");
}

export function splitSentences(response: string): string[] {
    // BREAKDOWN:
    // 1. (?:\d+\.\s+)? -> Optional Numbered List
    // 2. .*?           -> Content
    // 3. Delimiter Block:
    //    a. (?:[.!?…;]|:(?!\xa0))+  -> Match .!?…; OR a Colon (ONLY if NOT followed by \xa0)
    //    b. ["']?                   -> Optional Quote
    //    c. (?:[ \t]*[\p{Extended_Pictographic}]+)* -> Optional Emojis
    //    d. (?=\s|$)                -> Must be followed by ANY whitespace (including \xa0) or End

    const sentenceRegex = /(?:\d+\.\s+)?.*?(?:(?:[.!?…;]|:(?!\xa0))+["']?(?:[ \t]*[\p{Extended_Pictographic}]+)*(?=\s|$)|$|\n)/gu;

    if (!response) return [];

    return (protectSentenceInternalPeriods(response)
        .match(sentenceRegex) ?? [])
        .map((sentence) => sentence.trim())
        .map(restoreSentenceInternalPeriods)
        .filter((sentence) => sentence.length > 0);
}

const START_SEARCH_WINDOW = 30;
const START_ANCHOR_TOKENS = 4;
const ALIGNMENT_LOOKAHEAD = 12;
const SCORE_TOKEN_LIMIT = 8;

function normalizeToken(token: string): string {
    return token.toLowerCase().replace(/[^\w]|_/g, "");
}

function tokenizeSentence(sentence: string): string[] {
    return sentence.trim().split(/\s+/)
        .map(normalizeToken)
        .filter(token => token.length > 0);
}

function scoreCandidateStart(providerWords: NormalizedWord[], sentenceTokens: string[], candidateStart: number): number {
    let score = 0;
    let providerIndex = candidateStart;
    const scoredTokenCount = Math.min(sentenceTokens.length, SCORE_TOKEN_LIMIT);

    for (let tokenIndex = 0; tokenIndex < scoredTokenCount; tokenIndex++) {
        const token = sentenceTokens[tokenIndex];
        const searchLimit = Math.min(providerIndex + ALIGNMENT_LOOKAHEAD, providerWords.length);

        for (let index = providerIndex; index < searchLimit; index++) {
            if (providerWords[index]!.token === token) {
                score += 1;
                providerIndex = index + 1;
                break;
            }
        }
    }

    return score;
}

function findBestStartIndex(providerWords: NormalizedWord[], sentenceTokens: string[], cursor: number): number {
    let bestIndex = -1;
    let bestScore = -Infinity;
    const startSearchLimit = Math.min(cursor + START_SEARCH_WINDOW, providerWords.length);
    const anchorTokenCount = Math.min(START_ANCHOR_TOKENS, sentenceTokens.length);

    for (let providerIndex = cursor; providerIndex < startSearchLimit; providerIndex++) {
        for (let tokenOffset = 0; tokenOffset < anchorTokenCount; tokenOffset++) {
            if (providerWords[providerIndex]!.token !== sentenceTokens[tokenOffset]) {
                continue;
            }

            const candidateStart = Math.max(cursor, providerIndex - tokenOffset);
            const score = scoreCandidateStart(providerWords, sentenceTokens, candidateStart);
            const distancePenalty = (candidateStart - cursor) * 0.01;
            const adjustedScore = score - distancePenalty;

            if (adjustedScore > bestScore) {
                bestScore = adjustedScore;
                bestIndex = candidateStart;
            }
        }
    }

    return bestIndex === -1 ? cursor : bestIndex;
}

function alignSentenceTokens(providerWords: NormalizedWord[], sentenceTokens: string[], startIndex: number): number[] {
    const matchedIndices: number[] = [];
    let providerIndex = startIndex;

    for (const token of sentenceTokens) {
        const searchLimit = Math.min(providerIndex + ALIGNMENT_LOOKAHEAD, providerWords.length);

        for (let index = providerIndex; index < searchLimit; index++) {
            if (providerWords[index]!.token === token) {
                matchedIndices.push(index);
                providerIndex = index + 1;
                break;
            }
        }
    }

    return matchedIndices;
}

/**
  * Sequential sentence mapper with multi-token anchoring.
  * Handles punctuation differences, repeated common words, and skipped provider words.
  */
export function mapSentencesToWords(sentences: string[], words: Word[]): MappedSentence[] {
    if (!words || words.length === 0) return [];

    const providerWords = words
        .map(word => ({ ...word, token: normalizeToken(word.word) }))
        .filter(word => word.token.length > 0);

    if (providerWords.length === 0) return [];

    let cursor = 0;
    let lastEndTime = 0;

    return sentences.map((sentence) => {
        const sentenceTokens = tokenizeSentence(sentence);

        // --- CASE: SILENT SENTENCE (Emojis/Punctuation only) ---
        // If there are no words to match, we can't find it in audio.
        // Instead of 0, assign it the timestamp where the LAST sentence ended.
        if (sentenceTokens.length === 0) {
            return {
                text: sentence,
                start: lastEndTime,
                end: lastEndTime // It effectively has 0 audio duration
            };
        }

        const startIndex = findBestStartIndex(providerWords, sentenceTokens, cursor);
        const matchedIndices = alignSentenceTokens(providerWords, sentenceTokens, startIndex);
        const endIndex = matchedIndices.length > 0
            ? matchedIndices[matchedIndices.length - 1]!
            : Math.min(startIndex + sentenceTokens.length - 1, providerWords.length - 1);

        // Update cursor for next loop
        cursor = Math.max(endIndex + 1, startIndex + 1);

        // --- BOUNDS SAFETY ---
        // Ensure we don't crash or return "questions" for everything if we run off the end
        const safeStart = providerWords[startIndex] || providerWords[providerWords.length - 1];
        const safeEnd = providerWords[endIndex] || providerWords[providerWords.length - 1];

        // Update our tracker so the NEXT emoji sentence knows where to start
        lastEndTime = safeEnd ? safeEnd.end : lastEndTime;

        return {
            text: sentence,
            start: safeStart ? safeStart.start : 0,
            end: safeEnd ? safeEnd.end : 0
        };
    });
}
