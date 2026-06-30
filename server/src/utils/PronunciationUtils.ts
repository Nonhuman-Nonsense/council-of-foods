import aliasSharedData from '../data/pronunciations_alias.json' with { type: "json" };
import aliasEnData from '../data/pronunciations_alias_en.json' with { type: "json" };
import aliasSvData from '../data/pronunciations_alias_sv.json' with { type: "json" };
import ipaEnData from '../data/pronunciations_ipa_en.json' with { type: "json" };

interface Pronunciations {
    [word: string]: string;
}

interface RegexEntry {
    regex: RegExp;
    original: string;
    replacement: string;
}

export interface ProcessTextOptions {
    includeIpa: boolean;
}

function isSwedish(language: string): boolean {
    return language.toLowerCase().startsWith('sv');
}

/** #1020 → "number 1020" / "nummer 1020" for TTS (meeting IDs). */
const MEETING_NUMBER_PATTERN = /#(\d+)/g;

export class PronunciationUtils {
    private static regexCache = new Map<string, RegexEntry[]>();

    static escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    private static compileRegexes(pronunciations: Pronunciations): RegexEntry[] {
        const keys = Object.keys(pronunciations).sort((a, b) => b.length - a.length);
        return keys.map(word => {
            const replacement = pronunciations[word];
            const escapedWord = PronunciationUtils.escapeRegExp(word);
            const startBoundary = /^\w/.test(word) ? '\\b' : '';
            const endBoundary = /\w$/.test(word) ? '\\b' : '';
            const regex = new RegExp(`${startBoundary}${escapedWord}${endBoundary}`, 'gi');

            return { regex, original: word, replacement };
        });
    }

    private static getMergedAliases(language: string): Pronunciations {
        const langAliases = isSwedish(language)
            ? (aliasSvData as Pronunciations)
            : (aliasEnData as Pronunciations);

        return { ...(aliasSharedData as Pronunciations), ...langAliases };
    }

    private static getIpa(language: string, includeIpa: boolean): Pronunciations {
        if (!includeIpa || isSwedish(language)) {
            return {};
        }
        return ipaEnData as Pronunciations;
    }

    private static getRegexes(language: string, includeIpa: boolean): RegexEntry[] {
        const cacheKey = `${language}:${includeIpa}`;
        const cached = PronunciationUtils.regexCache.get(cacheKey);
        if (cached) return cached;

        try {
            const aliases = PronunciationUtils.getMergedAliases(language);
            const ipa = PronunciationUtils.getIpa(language, includeIpa);
            const regexes = [
                ...PronunciationUtils.compileRegexes(aliases),
                ...PronunciationUtils.compileRegexes(ipa),
            ];
            PronunciationUtils.regexCache.set(cacheKey, regexes);
            return regexes;
        } catch (error) {
            console.error("Failed to parse pronunciations:", error);
            return [];
        }
    }

    private static applyMeetingNumberAliases(
        text: string,
        language: string,
        replacedWords: Map<string, string>
    ): string {
        const prefix = isSwedish(language) ? 'nummer' : 'number';
        return text.replace(MEETING_NUMBER_PATTERN, (match, digits: string) => {
            const replacement = `${prefix} ${digits}`;
            replacedWords.set(replacement, match);
            return replacement;
        });
    }

    /**
     * Replaces known words with alias spell-outs and optionally IPA.
     * Returns:
     * - processedText: The text to send to TTS.
     * - replacedWords: A map of replacement string -> original word for subtitle restoration.
     */
    static processText(
        text: string,
        language: string,
        options: ProcessTextOptions
    ): { processedText: string; replacedWords: Map<string, string> } {
        const regexes = PronunciationUtils.getRegexes(language, options.includeIpa);
        let processedText = text;
        const replacedWords = new Map<string, string>();

        for (const entry of regexes) {
            processedText = processedText.replace(entry.regex, () => {
                replacedWords.set(entry.replacement, entry.original);
                return entry.replacement;
            });
        }

        processedText = PronunciationUtils.applyMeetingNumberAliases(
            processedText,
            language,
            replacedWords
        );

        return { processedText, replacedWords };
    }
}
