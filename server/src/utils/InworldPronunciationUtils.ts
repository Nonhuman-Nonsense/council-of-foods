
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Pronunciations {
    [word: string]: string;
}

export class InworldPronunciationUtils {
    private static pronunciations: Pronunciations | null = null;
    private static sortedRegexes: { regex: RegExp, original: string, replacement: string }[] | null = null;

    static loadPronunciations(): Pronunciations {
        if (InworldPronunciationUtils.pronunciations) return InworldPronunciationUtils.pronunciations;

        try {
            let dataPath = path.resolve(__dirname, '../data/pronunciations.json');

            if (!fs.existsSync(dataPath)) {
                console.warn(`Pronunciation file not found at ${dataPath}`);
                return {};
            }

            const data = fs.readFileSync(dataPath, 'utf-8');
            InworldPronunciationUtils.pronunciations = JSON.parse(data);

            // Pre-compile regexes for performance
            if (InworldPronunciationUtils.pronunciations) {
                const keys = Object.keys(InworldPronunciationUtils.pronunciations).sort((a, b) => b.length - a.length);
                InworldPronunciationUtils.sortedRegexes = keys.map(word => {
                    const replacement = InworldPronunciationUtils.pronunciations![word];
                    const escapedWord = InworldPronunciationUtils.escapeRegExp(word);
                    // Apply boundaries only if the key starts/ends with a word character
                    const startBoundary = /^\w/.test(word) ? '\\b' : '';
                    const endBoundary = /\w$/.test(word) ? '\\b' : '';
                    const regex = new RegExp(`${startBoundary}${escapedWord}${endBoundary}`, 'gi');

                    return { regex, original: word, replacement };
                });
            }

            return InworldPronunciationUtils.pronunciations || {};
        } catch (error) {
            console.error("Failed to load pronunciations:", error);
            return {};
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
        const pronunciations = InworldPronunciationUtils.loadPronunciations();
        let processedText = text;
        const replacedWords = new Map<string, string>();

        if (!pronunciations || !InworldPronunciationUtils.sortedRegexes || InworldPronunciationUtils.sortedRegexes.length === 0) {
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
