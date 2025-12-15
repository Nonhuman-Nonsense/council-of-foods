interface Word {
    word: string;
    start: number;
    end: number;
}

interface MappedSentence {
    text: string;
    start: number;
    end: number;
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

    return (response
        .match(sentenceRegex) ?? [])
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length > 0);
}

/**
  * Optimized sentence mapper with Multi-Token Anchoring.
  * Handles numbers ("1." vs "One") and skipped words automatically.
  */
export function mapSentencesToWords(sentences: string[], words: Word[]): MappedSentence[] {
    if (!words || words.length === 0) return [];

    // 1. Pre-process Whisper tokens for O(1) lookups
    const whisperTokens = words.map(w =>
        w.word.toLowerCase().replace(/[^\w]|_/g, "")
    );

    let cursor = 0;
    let lastEndTime = 0;

    return sentences.map((sentence) => {
        // 1. Tokenize (strips emojis/punctuation)
        const sentenceTokens = sentence.trim().split(/\s+/)
            .map(t => t.toLowerCase().replace(/[^\w]|_/g, ""))
            .filter(t => t.length > 0);

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

        // --- NORMAL MATCHING LOGIC ---
        let startIndex = -1;

        // We scan a window of 15 words from the cursor
        const startSearchLimit = Math.min(cursor + 15, whisperTokens.length);

        // Multi-token start search
        for (let tokenOffset = 0; tokenOffset < Math.min(3, sentenceTokens.length); tokenOffset++) {
            const targetToken = sentenceTokens[tokenOffset];
            for (let i = cursor; i < startSearchLimit; i++) {
                if (whisperTokens[i] === targetToken) {
                    // Found a match! Adjust start index back to the theoretical beginning
                    startIndex = Math.max(cursor, i - tokenOffset);
                    break;
                }
            }
            if (startIndex !== -1) break; // Stop if we found a match
        }

        // Fallback: If absolutely no words matched, stay at cursor
        if (startIndex === -1) startIndex = cursor;

        // Find End
        let endIndex = -1;
        const estimatedLength = sentenceTokens.length;
        // Look ahead from the FOUND start index
        const endSearchLimit = Math.min(startIndex + estimatedLength + 10, whisperTokens.length);

        // Try to match the last word, or the second to last (in case of punctuation issues)
        for (let tokenOffset = 0; tokenOffset < Math.min(3, sentenceTokens.length); tokenOffset++) {
            const targetToken = sentenceTokens[sentenceTokens.length - 1 - tokenOffset];

            // Scan backwards from limit to start (preferred for end words) or forwards
            // Here we scan forwards for simplicity and speed
            for (let i = startIndex; i < endSearchLimit; i++) {
                if (whisperTokens[i] === targetToken) {
                    endIndex = i;
                    // Heuristic: If we found the word very early, it might be a duplicate "the". 
                    // Keep searching if it's too close, otherwise take it.
                    if (i > startIndex + (estimatedLength * 0.5)) break;
                }
            }
            if (endIndex !== -1) break;
        }

        // Fallback: Calculate based on length if end not found
        if (endIndex === -1) {
            endIndex = Math.min(startIndex + estimatedLength - 1, whisperTokens.length - 1);
        }

        // Update cursor for next loop
        cursor = endIndex + 1;

        // --- BOUNDS SAFETY ---
        // Ensure we don't crash or return "questions" for everything if we run off the end
        const safeStart = words[startIndex] || words[words.length - 1];
        const safeEnd = words[endIndex] || words[words.length - 1];

        // Update our tracker so the NEXT emoji sentence knows where to start
        lastEndTime = safeEnd ? safeEnd.end : lastEndTime;

        return {
            text: sentence,
            start: safeStart ? safeStart.start : 0,
            end: safeEnd ? safeEnd.end : 0
        };
    });
}
