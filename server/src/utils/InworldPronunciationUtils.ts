
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
    private static sortedKeys: string[] | null = null;

    static loadPronunciations(): Pronunciations {
        if (InworldPronunciationUtils.pronunciations) return InworldPronunciationUtils.pronunciations;

        try {
            let dataPath = path.resolve(__dirname, '../data/pronunciations.json');

            if (!fs.existsSync(dataPath)) {
                // If not found in ../data (e.g. in dist structure), try adjusting
                // This fallback logic can be expanded if needed for deployment structures
                console.warn(`Pronunciation file not found at ${dataPath}`);
                return {};
            }

            const data = fs.readFileSync(dataPath, 'utf-8');
            InworldPronunciationUtils.pronunciations = JSON.parse(data);

            if (InworldPronunciationUtils.pronunciations) {
                InworldPronunciationUtils.sortedKeys = Object.keys(InworldPronunciationUtils.pronunciations)
                    .sort((a, b) => b.length - a.length);
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

        if (!pronunciations || !InworldPronunciationUtils.sortedKeys || InworldPronunciationUtils.sortedKeys.length === 0) {
            return { processedText, replacedWords };
        }

        for (const word of InworldPronunciationUtils.sortedKeys) {
            const ipa = pronunciations[word];

            const escapedWord = InworldPronunciationUtils.escapeRegExp(word);

            // Apply boundaries only if the key starts/ends with a word character
            // If key is "...", adding \b would fail because . is non-word.
            const startBoundary = /^\w/.test(word) ? '\\b' : '';
            const endBoundary = /\w$/.test(word) ? '\\b' : '';

            // Match whole word/phrase, case-insensitive
            const regex = new RegExp(`${startBoundary}${escapedWord}${endBoundary}`, 'gi');

            if (regex.test(processedText)) {
                // Determine original capitalization or just use dictionary key?
                // For restoration purposes, we just want the semantic word.
                // We'll map the IPA string to the dictionary key (word).
                replacedWords.set(ipa, word);
                processedText = processedText.replace(regex, ipa);
            }
        }

        return { processedText, replacedWords };
    }
}
