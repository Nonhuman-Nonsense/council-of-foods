import pronunciationsData from '../data/pronunciations.json' with { type: "json" };

interface Pronunciations {
    [word: string]: string;
}

export class InworldPronunciationUtils {
    private static sortedRegexes: { regex: RegExp, original: string, replacement: string }[] | null = null;

    static loadPronunciations(): void {
        if (InworldPronunciationUtils.sortedRegexes) return;

        try {
            // Pre-compile regexes for performance from imported data
            const keys = Object.keys(pronunciationsData).sort((a, b) => b.length - a.length);
            InworldPronunciationUtils.sortedRegexes = keys.map(word => {
                const replacement = (pronunciationsData as Pronunciations)[word];
                const escapedWord = InworldPronunciationUtils.escapeRegExp(word);
                // Apply boundaries only if the key starts/ends with a word character
                const startBoundary = /^\w/.test(word) ? '\\b' : '';
                const endBoundary = /\w$/.test(word) ? '\\b' : '';
                const regex = new RegExp(`${startBoundary}${escapedWord}${endBoundary}`, 'gi');

                return { regex, original: word, replacement };
            });
        } catch (error) {
            console.error("Failed to parse pronunciations:", error);
            InworldPronunciationUtils.sortedRegexes = [];
        }
    }

    static escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Replaces known words with their IPA equivalent.
     * Returns:
     * - processedText: The text to send to Inworld.
     * - replacedWords: A map of IPA string -> Original Word for restoration.
     */
    static processTextWithIPA(text: string): { processedText: string, replacedWords: Map<string, string> } {
        InworldPronunciationUtils.loadPronunciations();
        let processedText = text;
        const replacedWords = new Map<string, string>();

        if (!InworldPronunciationUtils.sortedRegexes || InworldPronunciationUtils.sortedRegexes.length === 0) {
            return { processedText, replacedWords };
        }

        for (const entry of InworldPronunciationUtils.sortedRegexes) {
            // Use replace with a callback to capture side-effects (populating the map) only on match
            // This avoids a separate .test() call or regex recompilation
            processedText = processedText.replace(entry.regex, () => {
                replacedWords.set(entry.replacement, entry.original);
                return entry.replacement;
            });
        }

        return { processedText, replacedWords };
    }
}
